'use strict'

var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:runtime:info:nodejs'
})

_log.debug('using info-browser')

function isBrowser() {
  return false
}

function isChromeApp() {
  return false
}

function isCordovaApp() {
  return false
}

function isNodeApp() {
  return true
}

function onRpi() {
  return process.arch === 'arm'
}

function onIDevice() {
  return false
}

module.exports = {
  isBrowser: isBrowser,
  isChromeApp: isChromeApp,
  isCordovaApp: isCordovaApp,
  isNodeApp: isNodeApp,
  onRpi: onRpi,
  onIDevice: onIDevice
}
