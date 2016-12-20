'use strict'

function AbstractScheduler () {
}

AbstractScheduler.prototype.connectP = function (connectionAttempts) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.register function not implemented'
  throw new Error(notImplementedYetErrorMsg)
}

AbstractScheduler.prototype.calculateConnectTimeout = function (timeouts) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.calculateConnectTimeout function not implemented'
  throw new Error(notImplementedYetErrorMsg)
}

module.exports = AbstractScheduler
