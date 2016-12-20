'use strict'

var AbstractScheduler = require('./abstract')
var Q = require('q')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function SequentialScheduler () {
  if (!(this instanceof SequentialScheduler)) {
    return new SequentialScheduler()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:scheduler:sequential'
  })
  // init
  AbstractScheduler.call(this)
}

// Inherit from AbstractScheduler
util.inherits(SequentialScheduler, AbstractScheduler)

SequentialScheduler.prototype.connectP = function (connectionAttempts) {
  // create chain of connect promises
  var promiseChain = Q.fcall(function () {
    // start
    return
  })
  var foundStream = false
  var self = this
  connectionAttempts.forEach(function (transportSpecs) {
    if (!foundStream) {
      promiseChain = promiseChain.then(function (stream) {
        // no stream found, execute a new connect promise
        if (!stream) {
          self._log.debug('no stream found, executing another connect promise')
          // create connect promise
          var transport = transportSpecs.transport
          var endpointInfo = transportSpecs.endpointInfo
          var connectPromise = transport.connectP(endpointInfo)
          // ignore errors
          return connectPromise.catch(function (error) {
            self._log.debug(error)
            return
          })
        // stream is found, fire event and stop further searching
        } else {
          foundStream = true
          self._log.debug('found stream -- forwarding to next stage')
          return stream
        }
      })
    }
  })
  return promiseChain
}

SequentialScheduler.prototype.calculateConnectTimeout = function (timeouts) {
  return timeouts.reduce(function (a, b) {
    return a + b
  })
}

module.exports = SequentialScheduler
