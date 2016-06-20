'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var PassThrough = require('stream').PassThrough

var debug = require('debug')
var debugLog = debug('1tp:transports:streams:proxy')
var errorLog = debug('1tp:transports:streams:proxy:error')

function ProxyStream () {
  if (!(this instanceof ProxyStream)) {
    return new ProxyStream()
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
  // done
  debugLog('created proxy stream.')
}

ProxyStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(ProxyStream, Duplex)

ProxyStream.prototype.connectStream = function (stream) {
  this._connectedStream = stream
  this._outboundPassThrough.pipe(this._connectedStream)
  this._connectedStream.pipe(this._inboundPassThrough)
}

ProxyStream.prototype._read = function (size) {
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
    errorLog(noStreamError)
    throw new Error(noStreamError)
  }
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

module.exports = ProxyStream
