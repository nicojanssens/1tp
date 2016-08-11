'use strict'

var debugLog = require('debug')('1tp')
var errorLog = require('debug')('1tp:error')

function debug (message) {
  debugLog.log(message)
}

function info (message) {
  debugLog.log(message)
}

function error (message) {
  errorLog.log(message)
}

module.exports.debug = debug
module.exports.error = error
module.exports.info = info
