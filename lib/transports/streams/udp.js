'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('../../utils')
var Retry = require('../../signaling/in-band/retry')
var signalingFactory = require('../../signaling/in-band/factory')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function UdpSession (peerAddress, sessionId, socket) {
  if (!(this instanceof UdpSession)) {
    return new UdpSession(peerAddress, sessionId, socket)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:sessions:udp'
  })
  // verify attributes
  if (peerAddress.address === undefined || peerAddress.port === undefined) {
    var peerAddressError = 'incorrect peerAddress: address and/or port attribute is undefined'
    throw new Error(peerAddressError)
  }
  // inherit from Duplex
  Duplex.call(this, UdpSession.DEFAULTS)
  // init
  this._peerAddress = peerAddress
  this._retry = new Retry()
  this._sessionId = (sessionId === null) ? myUtils.generateSessionId() : sessionId
  this._socket = socket
  this._state = UdpSession.STATE.INIT
  this._version = myUtils.version
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new udp session.')
}

UdpSession.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

UdpSession.STATE = {
  INIT: 0,
  CONNECTING: 1,
  CONNECTED: 2,
  CLOSING: 3,
  CLOSED: 4
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

UdpSession.prototype.processMessage = function (message) {
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
      .catch(function (error) {
        this._onError(error)
      })
    return
  }
  // if SYN-ACK packet
  if (message.type === signalingFactory.MESSAGE.SYN_ACK) {
    this._log.debug('incoming SYN-ACK packet')
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

// UdpTransport.prototype._processIncomingDgram = function (message) {
//   var stream
//   switch (message.type) {
//     case signalingFactory.MESSAGE.SYN:
//
//       // done
//       break
//     case signalingFactory.MESSAGE.SYN_ACK:
//       this._log.debug('incoming SYN-ACK packet')
//       // fire connect event
//       stream = this._streams[message.sessionId]
//       var peerConnectionInfo = this._peerConnectionInfo
//       var onSuccess = this._connectOnSuccess
//       this._fireConnectEvent(stream, peerConnectionInfo, onSuccess)
//       // done
//       break
//     case signalingFactory.MESSAGE.DATA:
//       this._log.debug('incoming DATA packet')
//       // write message to stream
//       this._streams[message.sessionId].push(message.data)
//       // done
//       break
//     case signalingFactory.MESSAGE.FIN:
//       this._log.debug('incoming FIN packet')
//       // send end of the stream (EOF)
//       this._streams[message.sessionId].push(null)
//       // deregister stream
//       delete this._streams[message.sessionId]
//       // done
//       break
//     case signalingFactory.MESSAGE.RST:
//       this._log.debug('incoming RST packet')
//       // destroy stream
//       this._streams[message.sessionId]._destroy()
//       // deregister stream
//       delete this._streams[message.sessionId]
//       // done
//       break
//     default:
//       var errorMsg = "don't know how to process message type " + message.type + ' -- dropping message on the floor'
//       this._log.error(errorMsg)
//       this._error(errorMsg)
//   }
// }


// HELPER FUNCTIONS //

UdpSession.prototype._onError = function(error) {
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
          self._onError(error)
        }
      }
    )
  }
  var promise = this._retry.executeP(sendOperation, transactionId)
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
