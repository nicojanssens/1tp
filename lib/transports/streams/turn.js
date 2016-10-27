'use strict'

var Duplex = require('stream').Duplex
var hat = require('hat')
var inherits = require('util').inherits
var myUtils = require('../../utils')
var netstring = require('netstring-stream')
var Retry = require('../../retry')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function TurnStream (peerAddress, turnClient, version) {
  if (!(this instanceof TurnStream)) {
    return new TurnStream(peerAddress, turnClient, version)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:streams:turn'
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
    throw new Error(turnClientUndefinedError)
  }
  // init
  Duplex.call(this, TurnStream.DEFAULTS)

  this._peerAddress = peerAddress
  this._sessionId = myUtils.generateSessionId()
  this._version = version
  this._turnClient = turnClient
  this._turnClient.on('relayed-message', this._onMessage())
  this._retry = new Retry()

  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)

  // done
  this._log.debug('created turn stream for (peer) connection info ' + JSON.stringify(peerAddress))
}

TurnStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

TurnStream.PACKET = {
  DATA: 0x00,
  FIN: 0x01,
  RST: 0x10,
  ACK: 0x11
}

inherits(TurnStream, Duplex)

// Half-closes the socket -- i.e. sends a FIN packet.
TurnStream.prototype.end = function () {
  this._log.debug('ending turn session with ' + JSON.stringify(this._peerAddress))
  var requestId = hat(8, 16)
  var self = this
  this._sendSignalingMessage(TurnStream.PACKET.FIN, requestId, function (error) {
    if (error) {
      self._log.error(error)
      self._error(error)
    }
    self._end()
  })
}

TurnStream.prototype.destroy = function () {
  this._log.debug('destroying turn session with ' + JSON.stringify(this._peerAddress))
  var requestId = hat(8, 16)
  var self = this
  this._sendSignalingMessage(TurnStream.PACKET.RST, requestId, function (error) {
    if (error) {
      self._log.error(error)
      self._error(error)
    }
    self._destroy()
  })
}

TurnStream.prototype._sendSignalingMessage = function (message, requestId, done) {
  this._log.debug('sending signaling message ' + message + ' for session ' + this._sessionId + ' to relay address ' + this._peerAddress.relayedAddress.address + ':' + this._peerAddress.relayedAddress.port)
  // prepare data chunk
  var typeByte = new Buffer(2)
  typeByte.writeUInt16BE(message)
  var sessionIdBytes = netstring.write(this._sessionId)
  var versionBytes = netstring.write(this._version)
  var requestIdBytes = netstring.write(requestId)
  var data = Buffer.concat([typeByte, sessionIdBytes, versionBytes, requestIdBytes])
  // send data chunk to relay
  this._turnClient.sendToRelay(
    data,
    this._peerAddress.relayedAddress.address,
    this._peerAddress.relayedAddress.port,
    done,
    done
  )
  var self = this
  // when stun transport is unreliable
  if (!this._turnClient._transport.isReliable()) {
    self._retry.untilConfirmed(
      requestId, // requestId
      function () { // onTimeout
        self._sendSignalingMessage(message, requestId, done)
      },
      done // onError
    )
  }
}

TurnStream.prototype._sendAckMessage = function (requestId) {
  var self = this
  this._sendSignalingMessage(
    TurnStream.PACKET.ACK,
    requestId,
    function (error) {
      if (error) {
        self._log.error(error)
        self._error(error)
      } else {
        self._log.debug('outgoing ACK')
      }
    }
  )
}

TurnStream.prototype._sendDataMessage = function (chunk, done) {
  var typeByte = new Buffer(2)
  typeByte.writeUInt16BE(TurnStream.PACKET.DATA)
  var sessionIdBytes = netstring.write(this._sessionId)
  var versionBytes = netstring.write(this._version)
  var chunkBytes = netstring.write(chunk)
  var data = Buffer.concat([typeByte, sessionIdBytes, versionBytes, chunkBytes])
  this._turnClient.sendToRelay(
    data,
    this._peerAddress.relayedAddress.address,
    this._peerAddress.relayedAddress.port,
    done,
    done
  )
}

TurnStream.prototype._onMessage = function () {
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
    var message = _parse(bytes)
    if (message.version === undefined) {
      var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
      self._log.error(undefinedVersionError)
      self._error(undefinedVersionError)
      return
    }
    // process incoming turn message
    self._processIncomingTurnMessage(message, senderAddress)
  }
}

TurnStream.prototype._processIncomingTurnMessage = function (message, senderAddress) {
  // if DATA packet
  if (message.type === TurnStream.PACKET.DATA) {
    this._log.debug('incoming DATA message from ' + JSON.stringify(senderAddress))
    this.push(message.data)
    return
  }
  // if FIN packet
  if (message.type === TurnStream.PACKET.FIN) {
    this._log.debug('incoming FIN from ' + JSON.stringify(senderAddress))
    this.push(null)
    // send ACK when stun transport is unreliable
    if (!this._turnClient._transport.isReliable()) {
      var finRequestId = message.data
      this._sendAckMessage(finRequestId)
    }
    return
  }
  // if RST packet
  if (message.type === TurnStream.PACKET.RST) {
    this._log.debug('incoming RST from ' + JSON.stringify(senderAddress))
    this._destroy()
    // send ACK when stun transport is unreliable
    if (!this._turnClient._transport.isReliable()) {
      var rstRequestId = message.data
      this._sendAckMessage(rstRequestId)
    }
    return
  }
  // if ACK packet
  if (message.type === TurnStream.PACKET.ACK) {
    this._log.debug('incoming ACK from ' + JSON.stringify(senderAddress))
    var requestId = message.data
    // when stun transport is unreliable
    if (!this._turnClient._transport.isReliable()) {
      this._retry.confirm(requestId)
    }
    return
  }
  // unknown message type
  this._log.debug("don't know how to process message " + message.type + ', dropping on the floor')
}

TurnStream.prototype._end = function () {
  // end writestream
  TurnStream.super_.prototype.end.call(this)
}

TurnStream.prototype._destroy = function () {
  this.emit('close')
}

TurnStream.prototype._write = function (chunk, encoding, done) {
  this._sendDataMessage(chunk, done)
}

TurnStream.prototype._read = function (size) {}

function _parse (bytes) {
  var offset = 2
  var type = bytes.slice(0, offset).readUInt16BE(0)
  var otherBytes = bytes.slice(offset, bytes.length)
  var params = netstring.read(otherBytes)
  var sessionIdBytes = params[0]
  var versionBytes = params[1]
  var dataBytes = params[2]
  return {
    type: type,
    sessionId: sessionIdBytes.toString(),
    version: versionBytes.toString(),
    data: dataBytes
  }
}

module.exports = TurnStream
