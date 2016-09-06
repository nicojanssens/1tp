'use strict'

if (typeof chrome !== 'undefined' &&
    typeof chrome.system !== 'undefined' &&
    typeof chrome.system.network !== 'undefined') {
  module.exports = require('./nic-chrome')
} else if (typeof networkinterface !== 'undefined') {
  module.exports = require('./nic-cordova')
} else {
  module.exports = require('./nic-nodejs')
}
