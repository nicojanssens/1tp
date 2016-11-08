'use strict'

var AbstractScheduler = require('./abstract')
var myUtils = require('../utils')
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
          var connectTimeoutPromise = self._createConnectTimeoutPromise(transportSpecs)
          return connectTimeoutPromise
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

SequentialScheduler.prototype._createConnectTimeoutPromise = function (transportSpecs) {
  // create connect promise
  var transport = transportSpecs.transport
  var endpointInfo = transportSpecs.endpointInfo
  var connectPromise = transport.connectP(endpointInfo)
  // resolve promise without result if it does not complete before timeout
  var self = this
  var connectTimeoutPromise = myUtils.timeoutResolvePromise(connectPromise, transport.connectTimeout(), function () {
    // on timeout, close connection
    var timeoutMessage = 'timeout while transport ' + transport.transportType() + ' tries to connect with ' + JSON.stringify(endpointInfo)
    self._log.debug(timeoutMessage)
  // TODO
  // transport.close()
  })
  return connectTimeoutPromise
}

module.exports = SequentialScheduler
