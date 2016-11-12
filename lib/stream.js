'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('./utils')
var PassThrough = require('stream').PassThrough
var timers = require('timers')
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
      module: '1tp:transports:streams:proxy'
    })
  }
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
  this._outboundPassThrough.end()
}

ProxyStream.prototype._end = function () {
  ProxyStream.super_.prototype.end.call(this)
}

ProxyStream.prototype.destroy = function () {
  this._outboundPassThrough.destroy()
}

ProxyStream.prototype._destroy = function () {
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

module.exports = ProxyStream
