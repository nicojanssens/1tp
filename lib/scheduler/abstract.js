'use strict'

function AbstractScheduler () {
}

AbstractScheduler.prototype.connectP = function (connectionAttempts) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.register function not implemented'
  throw new Error(notImplementedYetErrorMsg)
}

module.exports = AbstractScheduler
