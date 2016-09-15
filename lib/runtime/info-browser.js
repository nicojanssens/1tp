'use strict'

var MobileDetect = require('mobile-detect')
var md = new MobileDetect(navigator.userAgent)

function runsInBrowser() {
  return !runsInChromeApp() && !runsInCordovaApp()
}

function runsInChromeApp() {
  return window.chrome !== undefined
}

function runsInCordovaApp() {
  return window.cordova !== undefined
}

function runsOnArmNode() {
  return false
}

function runsOnNode() {
  return false
}

function runsOnIDevice() {
  return md.is('iOS')
}

module.exports = {
  runsInBrowser: runsInBrowser,
  runsInChromeApp: runsInChromeApp,
  runsInCordovaApp: runsInCordovaApp,
  runsOnNode: runsOnNode,
  runsOnArmNode: runsOnArmNode,
  runsOnIDevice: runsOnIDevice
}
