'use strict'

var Duplex = require('stream').Duplex
var utils = require('../../utils')
var inherits = require('inherits')

var debug = require('debug')
var debugLog = debug('1tp:transports:streams:turn')
var errorLog = debug('1tp:transports:streams:turn:error')

function TurnStream (peerAddress, turnClient) {
  if (!(this instanceof TurnStream)) {
    return new TurnStream(peerAddress, turnClient)
  }

  if (peerAddress.relayedAddress === undefined ||
    peerAddress.relayedAddress.address === undefined ||
    peerAddress.relayedAddress.port === undefined
  ) {
    var connectionInfoError = 'incorrect connectionInfo: relayed address and/or port attribute are undefined'
    throw new Error(connectionInfoError)
  }
  if (turnClient === undefined) {
    var turnClientUndefinedError = 'incorrect connectionInfo: turn client is undefined'
    throw new Error(turnClientUndefinedError)
  }

  Duplex.call(this, TurnStream.DEFAULTS)

  this._peerAddress = peerAddress
  this._turnClient = turnClient
  this._turnClient.on('relayed-message', this._onMessage())

  // register _error handler
  utils.mixinEventEmitterErrorFunction(this)

  // done
  debugLog('created turn stream for (peer) connection info ' + JSON.stringify(peerAddress))
}

TurnStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

TurnStream.PACKET = {
  FIN: 0x00,
  RST: 0x01
}

inherits(TurnStream, Duplex)

// Half-closes the socket -- i.e. sends a FIN packet.
TurnStream.prototype.end = function () {
  debugLog('ending turn session with ' + JSON.stringify(this._peerAddress))
  var endByte = new Buffer(1)
  endByte.writeUInt8(TurnStream.PACKET.FIN)
  var self = this
  this._write(endByte, 'binary', function (error) {
    if (error) {
      errorLog(error)
      self._error(error)
    }
    self._end()
  })
}

TurnStream.prototype.destroy = function () {
  debugLog('destroying turn session with ' + JSON.stringify(this._peerAddress))
  var endByte = new Buffer(1)
  endByte.writeUInt8(TurnStream.PACKET.RST)
  var self = this
  this._write(endByte, 'binary', function (error) {
    if (error) {
      errorLog(error)
      self._error(error)
    }
    self._destroy()
  })
}

TurnStream.prototype._onMessage = function () {
  var self = this
  return function (bytes, senderAddress) {
    if (senderAddress.address !== self._peerAddress.relayedAddress.address ||
      senderAddress.port !== self._peerAddress.relayedAddress.port
    ) {
      var errorMessage = 'received message from ' + JSON.stringify(senderAddress) + ', expected peer address to equal ' + JSON.stringify(self._peerAddress.relayedAddress)
      throw new Error(errorMessage)
    }
    if (bytes.readUInt8() === TurnStream.PACKET.FIN) {
      debugLog('incoming FIN')
      self.push(null)
      return
    }
    if (bytes.readUInt8() === TurnStream.PACKET.RST) {
      debugLog('incoming RST')
      self._destroy()
      return
    }
    debugLog('incoming message ' + bytes.toString() + ' from ' + JSON.stringify(senderAddress))
    self.push(bytes)
  }
}

TurnStream.prototype._end = function () {
  // end writestream
  TurnStream.super_.prototype.end.call(this)
}

TurnStream.prototype._destroy = function () {
  this.emit('close')
}

TurnStream.prototype._write = function (chunk, encoding, done) {
  this._turnClient.sendToRelay(
    chunk,
    this._peerAddress.relayedAddress.address,
    this._peerAddress.relayedAddress.port,
    done,
    done
  )
}

TurnStream.prototype._read = function (size) {}

module.exports = TurnStream
