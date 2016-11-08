'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('../../utils')
var Retry = require('../../signaling/in-band/retry')
var signalingFactory = require('../../signaling/in-band/factory')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function TurnSession (peerAddress, turnClient, sessionId) {
  if (!(this instanceof TurnSession)) {
    return new TurnSession(peerAddress, turnClient, sessionId)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:sessions:turn'
  })
  // verify attributes
  if (peerAddress.relayedAddress === undefined ||
    peerAddress.relayedAddress.address === undefined ||
    peerAddress.relayedAddress.port === undefined
  ) {
    var connectionInfoError = 'incorrect connectionInfo: relayed address and/or port attribute are undefined'
    this._log.error(connectionInfoError)
    throw new Error(connectionInfoError)
  }
  if (turnClient === undefined) {
    var turnClientUndefinedError = 'incorrect connectionInfo: turn client is undefined'
    this._log.error(turnClientUndefinedError)
    throw new Error(turnClientUndefinedError)
  }
  if (sessionId === undefined) {
    var sessionIdUndefinedError = 'incorrect connectionInfo: session id is undefined'
    this._log.error(sessionIdUndefinedError)
    throw new Error(sessionIdUndefinedError)
  }
  // inherit from Duplex
  Duplex.call(this, TurnSession.DEFAULTS)
  // init
  this._peerAddress = peerAddress
  this._retry = new Retry()
  this._sessionId = sessionId
  this._turnClient = turnClient
  this._turnClient.on('relayed-message', this._onIncomingBytes())
  this._version = myUtils.version
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created turn stream for (peer) connection info ' + JSON.stringify(peerAddress))
}

TurnSession.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(TurnSession, Duplex)

// STREAM OPERATIONS

TurnSession.prototype._read = function (size) {}

TurnSession.prototype._write = function (chunk, encoding, done) {
  // create data packet
  var bytes = signalingFactory.createDataPacket(this._sessionId, chunk)
  // send packet to relay
  this._turnClient.sendToRelay(
    bytes,
    this._peerAddress.relayedAddress.address,
    this._peerAddress.relayedAddress.port,
    done,
    done
  )
}

// Half-closes the socket -- i.e. sends a FIN packet.
TurnSession.prototype.end = function () {
  this._log.debug('ending turn session with ' + JSON.stringify(this._peerAddress))
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createFinPacket(this._sessionId, transactionId)
  // send packet to relay
  var self = this
  this._sendSignalingMessageP(bytes, transactionId)
    .then(function () {
      self._end()
    })
    .catch(function (error) {
      self._onError(error)
    })
}

TurnSession.prototype._end = function () {
  // end writestream
  TurnSession.super_.prototype.end.call(this)
}

// Closes the socket
TurnSession.prototype.destroy = function () {
  this._log.debug('destroying turn session with ' + JSON.stringify(this._peerAddress))
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createRstPacket(this._sessionId, transactionId)
  // send packet to relay
  var self = this
  this._sendSignalingMessageP(bytes, transactionId)
    .then(function () {
      self._destroy()
    })
    .catch(function (error) {
      self._onError(error)
    })
}

TurnSession.prototype._destroy = function () {
  this.emit('close')
}

// INCOMING MESSAGES //

TurnSession.prototype._onIncomingBytes = function () {
  var self = this
  return function (bytes, senderAddress) {
    // if unexpected peer address -> drop message on the floor
    if (senderAddress.address !== self._peerAddress.relayedAddress.address ||
      senderAddress.port !== self._peerAddress.relayedAddress.port
    ) {
      self._log.debug('received message from ' + JSON.stringify(senderAddress) + ', expected peer address to equal ' + JSON.stringify(self._peerAddress.relayedAddress))
      self._log.debug('dropping message on the floor')
      return
    }
    // parse message
    var message = signalingFactory.parse(bytes)
    if (message.version === undefined) {
      var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
      self._log.error(undefinedVersionError)
      self._error(undefinedVersionError)
      return
    }
    // process message
    self._processMessage(message, senderAddress)
  }
}

TurnSession.prototype._processMessage = function (message, senderAddress) {
  // if DATA packet
  if (message.type === signalingFactory.MESSAGE.DATA) {
    this._log.debug('incoming DATA message from ' + JSON.stringify(senderAddress))
    this.push(message.bytes)
    return
  }
  // if FIN packet
  if (message.type === signalingFactory.MESSAGE.FIN) {
    this._log.debug('incoming FIN from ' + JSON.stringify(senderAddress))
    this.push(null)
    // send ACK when stun transport is unreliable
    if (this._usesUnreliableTransport()) {
      var finTID = message.transactionId
      this._sendAckMessage(finTID)
    }
    return
  }
  // if RST packet
  if (message.type === signalingFactory.MESSAGE.RST) {
    this._log.debug('incoming RST from ' + JSON.stringify(senderAddress))
    this._destroy()
    // send ACK when stun transport is unreliable
    if (this._usesUnreliableTransport()) {
      var rstTID = message.transactionId
      this._sendAckMessage(rstTID)
    }
    return
  }
  // if ACK packet
  if (message.type === signalingFactory.MESSAGE.ACK) {
    var transactionId = message.transactionId
    this._log.debug('incoming ACK from ' + JSON.stringify(senderAddress) + ' for transaction ' + transactionId)
    // when stun transport is unreliable
    if (this._usesUnreliableTransport()) {
      this._retry.confirm(transactionId)
    }
    return
  }
  // unknown message type
  this._log.debug("don't know how to process message " + message.type.toString(16) + ', dropping on the floor')
}

// HELPER FUNCTIONS //

TurnSession.prototype._usesUnreliableTransport = function () {
  return !this._turnClient._transport.isReliable()
}

TurnSession.prototype._onError = function (error) {
  this._log.error(error)
  this._error(error)
}

TurnSession.prototype._sendAckMessage = function (transactionId) {
  this._log.debug('sending ack for transaction ' + transactionId)
  // create packet
  var bytes = signalingFactory.createAckPacket(this._sessionId, transactionId)
  // send packet to relay
  var self = this
  this._turnClient.sendToRelayP(bytes, this._peerAddress.relayedAddress.address, this._peerAddress.relayedAddress.port)
    .then(function () {
      self._log.debug('outgoing ACK for transactionId ' + transactionId)
    })
    .catch(function (error) {
      self._onError(error)
    })
}

TurnSession.prototype._sendSignalingMessageP = function (bytes, transactionId) {
  var self = this
  var promise
  // in case signaling messages are sent over a reliable transport, send message to relay
  if (!this._usesUnreliableTransport()) {
    promise = this._turnClient.sendToRelayP(
      bytes,
      this._peerAddress.relayedAddress.address,
      this._peerAddress.relayedAddress.port
    )
  // else re-send message to relay until ACK arrives
  } else {
    var sendOperation = function () {
      self._turnClient.sendToRelay(
        bytes,
        self._peerAddress.relayedAddress.address,
        self._peerAddress.relayedAddress.port,
        function () { /* do nothing */},
        function (error) {
          self._onError(error)
        }
      )
    }
    promise = this._retry.executeP(sendOperation, transactionId)
  }
  return promise
}

module.exports = TurnSession
