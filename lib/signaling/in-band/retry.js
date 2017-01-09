'use strict'

var events = require('events')
var merge = require('merge')
var Q = require('q')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function Retry (args) {
  this._args = merge(Object.create(Retry.DEFAULTS), args)
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:retry'
  })
  // remove me
  var hat = require('hat')
  this._id = hat(32, 16)
  // event emitter
  events.EventEmitter.call(this)
  // done
  this._log.debug('created repeater with args ' + JSON.stringify(this._args))
}

// Inherit EventEmitter
util.inherits(Retry, events.EventEmitter)

Retry.DEFAULTS = {
  maxRetries: 5,
  timeoutDelay: 500,
  maxDelay: 5000,
  exponentialBackoff: false
}

Retry.prototype.executeP = function (operation, operationId, delay, retries) {
  // set delay if undefined
  if (delay === undefined) {
    delay = this._args.timeoutDelay
  }
  // set retries if undefined
  if (retries === undefined) {
    retries = this._args.maxRetries
  }
  this._log.debug('scheduling promise execution until receiving event ' + operationId + ', delay = ' + delay + ', retries = ' + retries)
  var self = this
  var promise = Q.fcall(operation)
  // execute promise
  return promise.then(function () {
    var deferred = Q.defer()
    // if timeout before confirmEvent
    var timeout = setTimeout(
      function () {
        // remove confirm event listener
        self.removeAllListeners([operationId])
        // resolve
        deferred.resolve('timeout')
      },
      delay
    )
    // if event is fired
    self.addListener(operationId, function (resolve) {
      // then clear timeout
      clearTimeout(timeout)
      // and resolve if this event originates from a confirm call
      if (resolve) {
        self._log.debug('processing confirmation event')
        deferred.resolve('confirm')
      } else {
        // otherwise reject -- this event results from an abort call
        self._log.debug('processing abort event')
        deferred.resolve('abort') // will not have any effect if this promise already resolved
      }
    })
    return deferred.promise
  })
    .then(function (status) {
      switch (status) {
        case 'timeout':
          if (retries === 0) {
            // reject
            var timeoutMessage = 'giving up, no more retries left'
            self._log.debug(timeoutMessage)
            throw new Error(timeoutMessage)
          } else {
            // recursive call
            self._log.debug("let's give it another try")
            var newDelay = (self._args.exponentialBackoff) ? Math.min(self._args.maxDelay, delay * 2) : delay
            return self.executeP(operation, operationId, newDelay, retries - 1)
          }
          break
        case 'confirm':
          // resolve
          self._log.debug('execution ended -- done')
          break
        case 'abort':
          // reject
          var abortMessage = 'retry operation aborted'
          self._log.debug(abortMessage)
          throw new Error(abortMessage)
          break
        default:
          // reject
          var unkownStateError = 'status ' + status + ' is unknown, cannot proceed'
          self._log.error(unkownStateError)
          throw new Error(unkownStateError)
      }
    })
}

Retry.prototype.confirm = function (operationId) {
  this._log.debug('confirming operation ' + operationId)
  this.emit(operationId, true)
}

Retry.prototype.abort = function (operationId) {
  this._log.debug('aborting operation ' + operationId)
  this.emit(operationId, false)
}

module.exports = Retry
