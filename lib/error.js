'use strict'

var util = require('util')

function OneTpError (code, message) {
  this.code = code
  this.message = message || ''
  Error.captureStackTrace(this, this.constructor)
}

OneTpError.CODES = {
  handshakeAborted: 0,
  nothingToAbort: 1
}

util.inherits(OneTpError, Error)

module.exports = OneTpError
