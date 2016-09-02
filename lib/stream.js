'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('./utils')
var PassThrough = require('stream').PassThrough
var timers = require('timers')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function ProxyStream () {
  if (!(this instanceof ProxyStream)) {
    return new ProxyStream()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:streams:proxy'
  })
  // init duplex
  Duplex.call(this, ProxyStream.DEFAULTS)
  // create inbound and outbound streams
  this._outboundPassThrough = new PassThrough()
  this._inboundPassThrough = new PassThrough()
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
}

ProxyStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(ProxyStream, Duplex)

ProxyStream.prototype.connectStream = function (stream) {
  this._connectedStream = stream
  this._outboundPassThrough.on('error', this._error).pipe(this._connectedStream).on('error', this._error)
  this._connectedStream.on('error', this._error).pipe(this._inboundPassThrough).on('error', this._error)
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
    var noStreamError = 'no connected stream to write data to.'
    this._log.error(noStreamError)
    throw new Error(noStreamError)
  }
  this._unrefTimer()
  this._outboundPassThrough.write(chunk, encoding, done)
}

ProxyStream.prototype.end = function () {
  this._outboundPassThrough.end()
  var self = this
  process.nextTick(function () {
    self._end()
  })
}

ProxyStream.prototype._end = function () {
  // end writestream
  ProxyStream.super_.prototype.end.call(this)
}

// TODO: implement destroy functionality
ProxyStream.prototype._destroy = function () {
  for (var s = this; s !== null; s = s._parent) {
    timers.unenroll(s)
  }
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

ProxyStream.prototype._unrefTimer = function unrefTimer () {
  timers._unrefActive(this)
}

module.exports = ProxyStream
