'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('../../utils')
var Retry = require('../../signaling/in-band/retry')
var signalingFactory = require('../../signaling/in-band/factory')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function UdpSession (peerAddress, sessionId, socket) {
  if (!(this instanceof UdpSession)) {
    return new UdpSession(peerAddress, sessionId, socket)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:session:udp'
  })
  // verify attributes
  if (peerAddress.address === undefined || peerAddress.port === undefined) {
    var peerAddressError = 'incorrect peerAddress: address and/or port attribute is undefined'
    throw new Error(peerAddressError)
  }
  // inherit from Duplex
  Duplex.call(this, UdpSession.DUPLEX)
  // init
  this._peerAddress = peerAddress
  this._retry = new Retry()
  this._sessionId = (sessionId === null) ? myUtils.generateSessionId() : sessionId
  this._streamId = myUtils.generateStreamId()
  this._socket = socket
  this._state = UdpSession.STATE.INIT
  this._version = myUtils.version
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new udp session.')
}

UdpSession.DUPLEX = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

UdpSession.SIGNALING = {
  retransmissionDelay: 100,
  retries: 5
}

UdpSession.STATE = {
  INIT: 0,
  CONNECTING: 1,
  ABORTED: 2,
  CONNECTED: 3,
  CLOSING: 4,
  CLOSED: 5
}

inherits(UdpSession, Duplex)

// STREAM OPERATIONS

UdpSession.prototype.initHandshakeP = function () {
  this._log.debug('init handshake for udp session ' + this._sessionId)
  // change state
  this._state = UdpSession.STATE.CONNECTING
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createSynPacket(this._sessionId, transactionId)
  // store tid in case we need to abort this handshake
  this._synTID = transactionId
  // send message to peer
  var self = this
  return this._sendSignalingMessageReliablyP(bytes, transactionId)
    .then(function () {
      // change state
      self._state = UdpSession.STATE.CONNECTED
      // fire event
      self.emit('connected')
    })
}

UdpSession.prototype.abortHandshake = function () {
  this._log.debug('aborting handshake for udp session ' + this._sessionId)
  // discard request if already aborted
  if (this._state !== UdpSession.STATE.CONNECTING) {
    this._log.debug('cannot abort a session that is not CONNECTING -- ignoring request')
    return
  }
  // change state
  this._state = UdpSession.STATE.ABORTED
  // abort signaling retransmission
  this._retry.abort(this._synTID)
}

UdpSession.prototype._read = function (size) {
  // not supported
}

UdpSession.prototype._write = function (chunk, encoding, done) {
  // create data packet
  var bytes = signalingFactory.createDataPacket(this._sessionId, chunk)
  this._socket.send(bytes, 0, bytes.length, this._peerAddress.port, this._peerAddress.address, done)
}

// Half-closes the socket -- i.e. sends a FIN packet.
UdpSession.prototype.end = function () {
  this._log.debug('ending stream for udp session ' + this._sessionId)
  // change state
  this._state = UdpSession.STATE.CLOSING
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createFinPacket(this._sessionId, transactionId)
  // send message to peer
  var self = this
  this._sendSignalingMessageReliablyP(bytes, transactionId)
    .then(function () {
      self._end()
      // change state
      self._state = UdpSession.STATE.CLOSED
    })
    .catch(function (error) {
      self._onError(error)
    })
}

UdpSession.prototype._end = function () {
  // end write-stream
  UdpSession.super_.prototype.end.call(this)
}

UdpSession.prototype.destroy = function () {
  this._log.debug('closing stream for udp session ' + this._sessionId)
  // change state
  this._state = UdpSession.STATE.CLOSING
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createRstPacket(this._sessionId, transactionId)
  // send message to peer
  var self = this
  this._sendSignalingMessageReliablyP(bytes, transactionId)
    .then(function () {
      self._destroy()
      // change state
      self._state = UdpSession.STATE.CLOSED
    })
    .catch(function (error) {
      self._onError(error)
    })
}

UdpSession.prototype._destroy = function () {
  // destroy stream
  this.emit('close')
}

// INCOMING MESSAGES //

UdpSession.prototype.processMessage = function (message, onFailure) {
  this._log.debug('incoming message ' + JSON.stringify(message))
  // if SYN packet
  if (message.type === signalingFactory.MESSAGE.SYN) {
    this._log.debug('incoming SYN packet')
    // change state
    this._state = UdpSession.STATE.CONNECTING
    // create packet
    var synTID = message.transactionId
    var bytes = signalingFactory.createSynAckPacket(this._sessionId, synTID)
    var self = this
    this._sendSignalingMessageReliablyP(bytes, synTID)
      .then(function () {
        // change state
        self._state = UdpSession.STATE.CONNECTED
        // fire event
        self.emit('connected')
      })
      // if reliable transmission fails or gets aborted, then raise an error
      .catch(function (error) {
        self._onError(error, onFailure)
      })
    return
  }
  // if SYN-ACK packet
  if (message.type === signalingFactory.MESSAGE.SYN_ACK) {
    this._log.debug('incoming SYN-ACK packet')
    // ignore if handshake was aborted
    if (this._state === UdpSession.STATE.ABORTED) {
      this._log.debug('handshake aborted -- ignoring SYN-ACK packet')
      return
    }
    var synAckTID = message.transactionId
    this._retry.confirm(synAckTID)
    this._sendAckMessage(synAckTID)
    return
  }
  // if DATA packet
  if (message.type === signalingFactory.MESSAGE.DATA) {
    this._log.debug('incoming DATA message')
    this.push(message.bytes)
    return
  }
  // if FIN packet
  if (message.type === signalingFactory.MESSAGE.FIN) {
    this._log.debug('incoming FIN message')
    this.push(null)
    // send ACK
    var finTID = message.transactionId
    this._sendAckMessage(finTID)
    return
  }
  // if RST packet
  if (message.type === signalingFactory.MESSAGE.RST) {
    this._log.debug('incoming RST message')
    this._destroy()
    // send ACK
    var rstTID = message.transactionId
    this._sendAckMessage(rstTID)
    return
  }
  // if ACK packet
  if (message.type === signalingFactory.MESSAGE.ACK) {
    var transactionId = message.transactionId
    this._log.debug('incoming ACK for transaction ' + transactionId)
    this._retry.confirm(transactionId)
    return
  }
  // unknown message type
  this._log.debug("don't know how to process message " + message.type.toString(16) + ', dropping on the floor')
}

// HELPER FUNCTIONS //

UdpSession.prototype._onError = function (error) {
  this._log.error(error)
  this._error(error)
}

UdpSession.prototype._sendSignalingMessageReliablyP = function (bytes, transactionId) {
  var self = this
  var sendOperation = function () {
    self._socket.send(
      bytes,
      0,
      bytes.length,
      self._peerAddress.port,
      self._peerAddress.address,
      function (error) {
        if (error) {
          throw new Error(error)
        }
      }
    )
  }
  var promise = this._retry.executeP(
    sendOperation,
    transactionId,
    UdpSession.SIGNALING.retransmissionDelay,
    UdpSession.SIGNALING.retries
  )
  return promise
}

UdpSession.prototype._sendAckMessage = function (transactionId) {
  this._log.debug('sending ack for transaction ' + transactionId)
  // create packet
  var bytes = signalingFactory.createAckPacket(this._sessionId, transactionId)
  // send packet to peer
  var self = this
  this._socket.send(
    bytes,
    0,
    bytes.length,
    this._peerAddress.port,
    this._peerAddress.address,
    function (error) {
      if (error) {
        self._onError(error)
      }
    }
  )
}

module.exports = UdpSession
