'use strict'

var MobileDetect = require('mobile-detect')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var md = new MobileDetect(navigator.userAgent)

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:runtime:info:browser'
})

_log.debug('using info-browser')

function isBrowser() {
  return !isChromeApp() && !isCordovaApp()
}

function isChromeApp() {
  return window.chrome !== undefined
}

function isCordovaApp() {
  return window.cordova !== undefined
}

function isNodeApp() {
  return false
}

function onRpi() {
  return false
}

function onIDevice() {
  return md.is('iOS')
}

module.exports = {
  isBrowser: isBrowser,
  isChromeApp: isChromeApp,
  isCordovaApp: isCordovaApp,
  isNodeApp: isNodeApp,
  onRpi: onRpi,
  onIDevice: onIDevice
}
