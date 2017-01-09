'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('./utils')
var Q = require('q')
var Retry = require('./signaling/in-band/retry')
var signalingFactory = require('./signaling/in-band/factory')
var timers = require('timers')
var Transform = require('stream').Transform
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function ProxyStream () {
  if (!(this instanceof ProxyStream)) {
    return new ProxyStream()
  }
  // logging (don't override child _log -- if available)
  if (!this._log) {
    this._log = winstonWrapper(winston)
    this._log.addMeta({
      module: '1tp:transports:session:proxy'
    })
  }
  // init duplex
  Duplex.call(this, ProxyStream.DEFAULTS)
  // create inbound and outbound streams
  this._outboundPassThrough = new DataPackaging()
  this._inboundPassThrough = new DataFiltering()
  // listen to _inboundPassThrough
  var self = this
  this._inboundPassThrough
    .on('readable', function () {
      self._readFromInboundPassThrough()
    })
    .on('end', function () {
      self.push(null) // EOF
    })
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created proxy stream')

  this._testId = myUtils.generateStreamId()
}

ProxyStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(ProxyStream, Duplex)

ProxyStream.prototype.connectStream = function (stream) {
  var self = this
  if (this._connectedStream) {
    var streamAvailableError = 'cannot overwrite connected stream'
    this._log.error(streamAvailableError)
    this._error(streamAvailableError)
  }
  this._connectedStream = stream
  // pipe error events
  this._outboundPassThrough.on('error', this._error).pipe(this._connectedStream).on('error', this._error)
  this._connectedStream.on('error', this._error).pipe(this._inboundPassThrough).on('error', this._error)
  // pipe writestream finished/flushed event
  this._outboundPassThrough.on('finish', function () {
    self._log.debug('all writes on the outbound-passthrough are complete')
    // stop timers if readstream was also ended
    if (!self._outboundPassThrough.readable) {
      self._deactivateTimeout()
    }
    self._end()
  })
  // pipe readstream end event
  this._outboundPassThrough.on('end', function () {
    self._log.debug('no more data to be consumed from the outbound-passthrough stream')
    // stop timers if writestream was also finished
    if (!self._outboundPassThrough.writable) {
      self._deactivateTimeout()
    }
    self.push(null)
  })
  // pipe close event
  this._outboundPassThrough.on('close', function () {
    self._log.debug('outbound-passthrough stream is closed')
    // stop timers
    self._deactivateTimeout()
    self._destroy()
  })
}

ProxyStream.prototype._initHandshakeP = function () {
  this._log.debug('initiating handshake')
  if (this._connectedStream === undefined) {
    var noConnectedStreamError = 'no connected stream found, cannot init handshake'
    this._log.error(noConnectedStreamError)
    this._error(noConnectedStreamError)
  }
  // create PING packet to transmit over established connection
  var retry = new Retry()
  var transactionId = myUtils.generateTransactionId()
  var pingPacket = signalingFactory.createPingPacket()
  var self = this
  // wait for PONG or DATA message
  this._connectedStream.once('data', function (bytes) {
    var packet = signalingFactory.parseSocketPacket(bytes)
    if (packet === undefined) {
      var undefinedMessageTypeError = 'incorrect signaling message: undefined message type -- ignoring message'
      self._log.error(undefinedMessageTypeError)
    } else if (packet.type === signalingFactory.MESSAGE.DATA) {
      self._log.debug('receiving DATA packet -> ending retansmission and resolving retry promise')
      retry.confirm(transactionId)
    } else if (packet.type === signalingFactory.MESSAGE.PONG) {
      self._log.debug('receiving PONG packet -> ending retansmission and resolving retry promise')
      retry.confirm(transactionId)
    } else {
      var unexpectedMessageTypeError = 'incorrect signaling message: unexpected message type -- ignoring message'
      self._log.error(unexpectedMessageTypeError)
    }
  })
  // send PING packet
  var sendPingMessage = function () {
    self._log.debug('sending PING packet')
    self._connectedStream.write(pingPacket)
  }
  var promise = retry.executeP(sendPingMessage, transactionId)
  return promise
}

ProxyStream.prototype._waitForHandshakeP = function () {
  this._log.debug('waiting for handshake')
  if (this._connectedStream === undefined) {
    var noConnectedStreamError = 'no connected stream found, cannot participate in handshake'
    this._log.error(noConnectedStreamError)
    this._error(noConnectedStreamError)
  }
  var self = this
  var deferred = Q.defer()
  // wait for PING message
  var _onIncomingMessage = function (bytes) {
    var packet = signalingFactory.parseSocketPacket(bytes)
    if (packet.type === undefined) {
      var undefinedMessageTypeError = 'incorrect signaling message: undefined message type -- ignoring message'
      self._log.error(undefinedMessageTypeError)
    } else if (packet.type === signalingFactory.MESSAGE.DATA) {
      self._log.debug('receiving DATA packet -- ignoring message (and no registration for new incoming packet)')
      if (self._active) {
        var unexpectedDataPacketError = 'receiving DATA before PING packet'
        self._log.error(unexpectedDataPacketError)
        deferred.reject(unexpectedDataPacketError)
      }
    } else if (packet.type !== signalingFactory.MESSAGE.PING) {
      var unexpectedMessageTypeError = 'incorrect signaling message: unexpected message type -- ignoring message'
      self._log.error(unexpectedMessageTypeError)
      deferred.reject(unexpectedMessageTypeError)
    } else {
      // create PONG packet
      var pongPacket = signalingFactory.createPongPacket()
      self._log.debug('sending PONG packet')
      self._connectedStream.write(pongPacket)
      // wait for another PING or DATA packet
      self._connectedStream.once('data', _onIncomingMessage)
      // resolve if the first PING message has arrived
      if (!self._active) {
        self._log.debug('init PONG packet -> resolving promise')
        self._active = true
        deferred.resolve(true)
      }
    }
  }
  this._connectedStream.once('data', _onIncomingMessage)
  return deferred.promise
}

ProxyStream.prototype._read = function (size) {
  this._unrefTimer()
  this._readFromInboundPassThrough(size)
}

ProxyStream.prototype._readFromInboundPassThrough = function (size) {
  var chunk
  while ((chunk = this._inboundPassThrough.read(size)) !== null) {
    // if push returns false, stop writing
    if (!this.push(chunk)) {
      break
    }
  }
}

ProxyStream.prototype._write = function (chunk, encoding, done) {
  if (!this._connectedStream) {
    var noStreamError = 'no connected stream to write data to'
    this._log.error(noStreamError)
    this._error(noStreamError)
  }
  this._unrefTimer()
  this._outboundPassThrough.write(chunk, encoding, done)
}

ProxyStream.prototype.end = function () {
  this._log.debug('ending proxy stream')
  this._outboundPassThrough.end()
}

ProxyStream.prototype._end = function () {
  this._log.debug('proxy stream ended')
  ProxyStream.super_.prototype.end.call(this)
}

ProxyStream.prototype.destroy = function () {
  this._log.debug('destroying proxy stream')
  this._connectedStream.destroy()
}

ProxyStream.prototype._destroy = function () {
  this._log.debug('proxy stream destroyed')
  this.emit('close')
}

/** timer usage is heavily inspired by https://github.com/nodejs/node/blob/master/lib/net.js */
ProxyStream.prototype.setTimeout = function (msecs, callback) {
  if (msecs === 0) {
    timers.unenroll(this)
    if (callback) {
      this.removeListener('timeout', callback)
    }
  } else {
    timers.enroll(this, msecs)
    timers._unrefActive(this)
    if (callback) {
      this.once('timeout', callback)
    }
  }
  return this
}

ProxyStream.prototype._onTimeout = function () {
  this._log.debug('timeout')
  this.emit('timeout')
}

ProxyStream.prototype._unrefTimer = function () {
  timers._unrefActive(this)
}

ProxyStream.prototype._deactivateTimeout = function () {
  timers.unenroll(this)
}

function DataFiltering (options) {
  if (!(this instanceof DataFiltering)) {
    return new DataFiltering(options)
  }
  Transform.call(this, options)
}

util.inherits(DataFiltering, Transform)

DataFiltering.prototype._transform = function(bytes, encoding, cb) {
  var packet = signalingFactory.parseSocketPacket(bytes)
  // when this is a DATA packet
  if (packet.type === signalingFactory.MESSAGE.DATA) {
    // then proceed -- other packets are ignored
    this.push(packet.data)
  }
  // done
  cb()
}

function DataPackaging (options) {
  if (!(this instanceof DataPackaging)) {
    return new DataPackaging(options)
  }
  Transform.call(this, options)
}

util.inherits(DataPackaging, Transform)

DataPackaging.prototype._transform = function(bytes, encoding, cb) {
  // create DATA packet
  var dataPacket = signalingFactory.wrapDataPacket(bytes)
  // done
  cb(null, dataPacket)
}

module.exports = ProxyStream
