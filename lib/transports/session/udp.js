'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var merge = require('merge')
var myUtils = require('../../utils')
var Retry = require('../../signaling/in-band/retry')
var signalingFactory = require('../../signaling/in-band/factory')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function UdpSession (peerAddress, sessionId, socket, args) {
  if (!(this instanceof UdpSession)) {
    return new UdpSession(peerAddress, sessionId, socket, args)
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
  this._args = merge(Object.create(UdpSession.SIGNALING), args)
  this._peerAddress = peerAddress
  this._retry = new Retry()
  this._sessionId = (sessionId === null) ? myUtils.generateSessionId() : sessionId
  this._streamId = myUtils.generateStreamId()
  this._socket = socket
  this._state = UdpSession.STATE.INIT
  this._version = myUtils.version
  // retransmissionDelay must be >= 10 ms
  this._args.retransmissionDelay = Math.max(10, this._args.retransmissionDelay)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new udp session using args ' + JSON.stringify(this._args))
}

UdpSession.DUPLEX = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

UdpSession.SIGNALING = {
  retransmissionDelay: 150,
  retries: 5
}

UdpSession.STATE = {
  INIT: 0,
  CONNECTING: 1,
  ABORTED: 2,
  CONNECTED: 3,
  HALF_CLOSING: 4,
  HALF_CLOSED: 5,
  CLOSING: 6,
  CLOSED: 7
}

inherits(UdpSession, Duplex)

// STREAM OPERATIONS

UdpSession.prototype.initHandshakeP = function () {
  this._log.debug('init handshake for udp session ' + this._sessionId)
  // ignore if session is not in INIT phase
  if (this._state !== UdpSession.STATE.INIT) {
    this._log.debug('session not in INIT state -- ignoring request')
    return
  }
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
  // ignore if session is not in CONNECTING phase
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
UdpSession.prototype.end = function (callback) {
  this._log.debug('ending stream for udp session ' + this._sessionId)
  // ignore if session is not in CONNECTED phase
  if (this._state !== UdpSession.STATE.CONNECTED) {
    this._log.debug('cannot close a session that is not CONNECTED -- ignoring request')
    return
  }
  var self = this
  // change state
  this._state = UdpSession.STATE.HALF_CLOSING
  // create packet
  var transactionId = myUtils.generateTransactionId()
  var bytes = signalingFactory.createFinPacket(this._sessionId, transactionId)
  // send message to peer
//  var self = this
  this._sendSignalingMessageReliablyP(bytes, transactionId)
    .then(function () {
      self._end(callback)
    })
    .catch(function (error) {
      self._end(callback)
      self._onError(error)
    })
}

UdpSession.prototype._end = function (callback) {
  // change state
  this._state = UdpSession.STATE.HALF_CLOSING
  // close write stream
  var self = this
  UdpSession.super_.prototype.end.call(self, function () {
    self._log.debug('ended stream for udp session ' + self._sessionId)
    // change state
    self._state = UdpSession.STATE.HALF_CLOSED
    // fire callback, if defined
    if (typeof callback === 'function') {
      callback()
    }
  })
}

UdpSession.prototype.destroy = function () {
  this._log.debug('destroying stream for udp session ' + this._sessionId)
  // ignore if session is not in CONNECTED phase
  if (this._state !== UdpSession.STATE.CONNECTED) {
    this._log.debug('cannot close a session that is not CONNECTED -- ignoring request')
    return
  }
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
    })
    .catch(function (error) {
      self._destroy()
      self._onError(error)
    })
}

UdpSession.prototype._destroy = function () {
  this._log.debug('destroyed stream for udp session ' + this._sessionId)
  var self = this
  // change state
  this._state = UdpSession.STATE.CLOSING
  // close read stream
  this.push(null)
  // TODO: hack -- in some cases the readStream object indicates that the readStream has ended, but the end event is not fired
  this.readable = false
  // close write stream
  UdpSession.super_.prototype.end.call(self, function () {
    self._log.debug('ended stream for udp session ' + self._sessionId)
    // change state
    self._state = UdpSession.STATE.CLOSED
    // emit close event
    self.emit('close')
  })
}

// INCOMING MESSAGES //

UdpSession.prototype.processMessage = function (message, onFailure) {
  this._log.debug('incoming message ' + JSON.stringify(message))
  // if SYN packet
  if (message.type === signalingFactory.MESSAGE.SYN) {
    this._log.debug('incoming SYN packet')
    // ignore if session is not in INIT phase
    if (this._state !== UdpSession.STATE.INIT) {
      this._log.debug('session not in INIT state -- ignoring message')
      return
    }
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
    // ignore if session is not in CONNECTING (no SYN-ACK had arrived) or CONNECTED phase (SYN-ACK retransmission)
    if ([UdpSession.STATE.CONNECTING, UdpSession.STATE.CONNECTED].indexOf(this._state) === -1) {
      this._log.debug('session not in CONNECTING or CONNECTED state -- ignoring message')
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
    // ignore if
    // a) session is not in CONNECTED,
    // b) session is HALF_CLOSING -- i.e. peer ends stream before ACK has arrived, or
    // c) session is HALF_CLOSED -- outbound connection is already closed
    if ([UdpSession.STATE.CONNECTED, UdpSession.STATE.HALF_CLOSING, UdpSession.STATE.HALF_CLOSED].indexOf(this._state) === -1) {
      this._log.debug('session not in CONNECTED, HALF_CLOSING or HALF_CLOSED state -- ignoring message')
      return
    }
    this.push(null)
    // send ACK
    var finTID = message.transactionId
    this._sendAckMessage(finTID)
    return
  }
  // if RST packet
  if (message.type === signalingFactory.MESSAGE.RST) {
    this._log.debug('incoming RST message')
    // ignore if session is not in CONNECTED phase
    if (this._state !== UdpSession.STATE.CONNECTED) {
      this._log.debug('session not in CONNECTED state -- ignoring message')
      return
    }
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
    // ignore if session is not in CONNECTING, HALF_CLOSING or CLOSING phase
    if ([UdpSession.STATE.CONNECTING, UdpSession.STATE.HALF_CLOSING, UdpSession.STATE.CLOSING].indexOf(this._state) === -1) {
      this._log.debug('session not in CONNECTING, HALF_CLOSING or CLOSING state -- ignoring message')
      return
    }
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
    this._args.retransmissionDelay,
    this._args.retries
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
