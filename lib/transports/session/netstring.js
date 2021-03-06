'use strict'

var Duplex = require('stream').Duplex
var inherits = require('util').inherits
var myUtils = require('../../utils')
var netstring = require('netstring-stream')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function NetStringStream () {
  if (!(this instanceof NetStringStream)) {
    return new NetStringStream()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:session:netstring'
  })
  // init
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
  this._log.debug('created new netstring stream.')
}

NetStringStream.DEFAULTS = {
  allowHalfOpen: true,
  readableObjectMode: false,
  writableObjectMode: false
}

inherits(NetStringStream, Duplex)

NetStringStream.prototype.attachToEncoder = function (stream) {
  var self = this
  this.encoder.on('error', this._error).pipe(stream).on('error', this._error)
  this.encoder.on('close', function () {
    if (typeof stream.destroy === 'function') {
      self._log.debug('closing destination stream')
      stream.destroy()
    }
  })
  this.encoder.on('error', function (error) {
    self._log.error(error)
    self._error(error)
  })
}

NetStringStream.prototype.attachToDecoder = function (stream) {
  var self = this
  stream.on('error', this._error).pipe(this.decoder).on('error', this._error)
  stream.on('close', function () {
    self._log.debug('destination stream closed')
    self.destroy()
  })
  stream.on('error', function (error) {
    self._log.error(error)
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

NetStringStream.prototype._read = function (size) {}

module.exports = NetStringStream
