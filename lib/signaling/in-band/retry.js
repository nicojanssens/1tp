'use strict'

var events = require('events')
var merge = require('merge')
var Q = require('q')
var util = require('util')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function Retry (opts) {
  this._opts = merge(Object.create(Retry.DEFAULTS), opts)
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:retry'
  })
  // event emitter
  events.EventEmitter.call(this)
  // done
  this._log.debug('created repeater with opts ' + JSON.stringify(this._opts))
}

// Inherit EventEmitter
util.inherits(Retry, events.EventEmitter)

Retry.DEFAULTS = {
  maxRetries: 5,
  timeoutDelay: 500
}

Retry.prototype.executeP = function (operation, confirmEventName, delay, retries) {
  this._log.debug('scheduling promise execution until receiving event ' + confirmEventName)
  // set delay if undefined
  if (delay === undefined) {
    delay = this._opts.timeoutDelay
  }
  // set retries if undefined
  if (retries === undefined) {
    retries = this._opts.maxRetries
  }
  var self = this
  var promise = Q.fcall(operation)
  // execute promise
  return promise.then(function () {
    var deferred = Q.defer()
    // if timeout before confirmEvent
    var timeout = setTimeout(
      function () {
        // remove confirm event listener
        self.removeAllListeners([confirmEventName])
        // resolve
        deferred.resolve(false)
      },
      delay
    )
    // if confirm event is fired
    self.once(confirmEventName, function () {
      // then clear timeout
      clearTimeout(timeout)
      // and resolve
      deferred.resolve(true)
    })
    return deferred.promise
  }).then(function (confirmed) {
    if (!confirmed) {
      if (retries === 0) {
        var message = 'giving up, no more retries left'
        self._log.debug(message)
        throw new Error(message)
      } else {
        self._log.debug("let's give it another try")
        return self.executeP(operation, confirmEventName, delay, retries - 1)
      }
    } else {
      self._log.debug('confirmation arrived -- done')
    }
  })
}

Retry.prototype.confirm = function (confirmEventName) {
  this._log.debug('confirming ' + confirmEventName)
  this.emit(confirmEventName)
}

module.exports = Retry
