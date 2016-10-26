'use strict'

var merge = require('merge')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function Retry (opts) {
  this._opts = merge(Object.create(Retry.DEFAULTS), opts)
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:retry'
  })
  // init
  this._unconfirmedRequests = {}
  // done
  this._log.debug('created repeater with opts ' + this._opts)
}

Retry.DEFAULTS = {
  maxRetries: 5,
  timeoutDelay: 500
}

Retry.prototype.untilConfirmed = function (requestId, onTimeout, onError) {
  this._log.debug('scheduling retry of request ' + requestId)
  // prepare request-info, if undefined for requestId
  if (this._unconfirmedRequests[requestId] === undefined) {
    this._unconfirmedRequests[requestId] = {}
    this._unconfirmedRequests[requestId].retriesLeft = this._opts.maxRetries
  }
  var self = this
  // start retransmission timer
  var timeout = setTimeout(
    function () {
      if (self._unconfirmedRequests[requestId].retriesLeft === 0) {
        // stopping retransmission
        var errorMsg = 'giving up, no more retries left'
        onError(errorMsg)
        delete self._unconfirmedRequests[requestId]
      } else {
        self._unconfirmedRequests[requestId].retriesLeft--
        onTimeout()
      }
    },
    self._opts.timeoutDelay
  )
  self._unconfirmedRequests[requestId].timeout = timeout
}

Retry.prototype.confirm = function (requestId) {
  this._log.debug('confirming request ' + requestId)
  // stop retransmission timer (if present)
  var timeout = this._unconfirmedRequests[requestId].timeout
  clearTimeout(timeout)
  delete this._unconfirmedRequests[requestId]
}

module.exports = Retry
