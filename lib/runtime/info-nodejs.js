'use strict'

function runsInBrowser() {
  return false
}

function runsInChromeApp() {
  return false
}

function runsInCordovaApp() {
  return false
}

function runsOnArmNode() {
  return process.arch === 'arm'
}

function runsOnNode() {
  return true
}

function runsOnIDevice() {
  return false
}

module.exports = {
  runsInBrowser: runsInBrowser,
  runsInChromeApp: runsInChromeApp,
  runsInCordovaApp: runsInCordovaApp,
  runsOnNode: runsOnNode,
  runsOnArmNode: runsOnArmNode,
  runsOnIDevice: runsOnIDevice
}
