'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('../../utils')
var netstring = require('netstring-stream')

var debug = require('debug')
var debugLog = debug('1tp:transports:streams:netstring')
var errorLog = debug('1tp:transports:streams:netstring:error')

function NetStringStream () {
  if (!(this instanceof NetStringStream)) {
    return new NetStringStream()
  }

  Duplex.call(this, NetStringStream.DEFAULTS)

  this.encoder = netstring.writeStream() // this is a through2 stream
  this.decoder = netstring.readStream() // idem

  this._destroyed = false

  var self = this
  this.decoder.on('end', function () {
    self.push(null) // EOF
  })
  this.decoder.on('readable', function () {
    var chunk
    while ((chunk = self.decoder.read()) !== null) {
      if (!self.push(chunk)) {
        break
      }
    }
  })

  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)

  // done
  debugLog('created new netstring stream.')
}

NetStringStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(NetStringStream, Duplex)

NetStringStream.prototype.attachToEncoder = function (stream) {
  var self = this
  this.encoder.pipe(stream)
  this.encoder.on('close', function () {
    if (typeof stream.destroy === 'function') {
      debugLog('closing destination stream')
      stream.destroy()
    }
  })
  this.encoder.on('error', function (error) {
    errorLog(error)
    self._error(error)
  })
}

NetStringStream.prototype.attachToDecoder = function (stream) {
  var self = this
  stream.pipe(this.decoder)
  stream.on('close', function () {
    debugLog('destination stream closed')
    self.destroy()
  })
  stream.on('error', function (error) {
    errorLog(error)
    self._error(error)
  })
}

NetStringStream.prototype.end = function () {
  this.encoder.end()
  var self = this
  process.nextTick(function () {
    self._end()
  })
}

NetStringStream.prototype.destroy = function () {
  if (!this._destroyed) {
    this.emit('close')
    this.encoder.destroy()
    this.decoder.destroy()
    this._destroyed = true
  }
}

NetStringStream.prototype._end = function () {
  // end writestream
  NetStringStream.super_.prototype.end.call(this)
}

NetStringStream.prototype._write = function (chunk, encoding, done) {
  this.encoder.write(chunk, encoding, done)
}

NetStringStream.prototype._read = function (size) {
}

module.exports = NetStringStream
