'use strict'

if (typeof chrome !== 'undefined' &&
    typeof chrome.system !== 'undefined' &&
    typeof chrome.system.network !== 'undefined') {
  module.exports = require('./nic-chrome-cordova')
} else {
  module.exports = require('./nic-nodejs')
}
