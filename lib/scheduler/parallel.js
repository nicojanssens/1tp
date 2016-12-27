'use strict'

var AbstractScheduler = require('./abstract')
var OneTpError = require('../error')
var Q = require('q')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function ParallelScheduler () {
  if (!(this instanceof ParallelScheduler)) {
    return new ParallelScheduler()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:scheduler:parallel'
  })
  // init
  AbstractScheduler.call(this)
}

// Inherit from AbstractScheduler
util.inherits(ParallelScheduler, AbstractScheduler)

ParallelScheduler.prototype.connectP = function (connectionAttempts) {
  var self = this
  var connectPromises = connectionAttempts.map(function (connectionSpecs) {
    var transport = connectionSpecs.transport
    var endpointInfo = connectionSpecs.endpointInfo
    self._log.debug('preparing connection attempt with ' + JSON.stringify(endpointInfo))
    var connectPromise = transport.connectP(endpointInfo)
    return connectPromise
  })
  var connectedStream
  return Q.any(connectPromises)
    .then(function (stream) {
      self._log.debug('connection established with ' + JSON.stringify(stream.peerConnectionInfo))
      connectedStream = stream
      var abortPromises = connectionAttempts.map(function (connectionSpecs) {
        var transport = connectionSpecs.transport
        var endpointInfo = connectionSpecs.endpointInfo
        if (connectionSpecs.endpointInfo !== stream.peerConnectionInfo) {
          self._log.debug('preparing to abort connection with ' + JSON.stringify(endpointInfo))
          // create abort promise
          var abortPromise = transport.abortP(endpointInfo)
            .catch(function (error) {
              // resolve if abort promise complains that there is nothing to abort
              if (error.code === OneTpError.CODES.nothingToAbort) {
                return
              } else {
                self._log.error(error.message)
                throw error
              }
            })
          return abortPromise
        }
      })
      return Q.all(abortPromises)
    })
    .then(function () {
      self._log.debug('all remaining connection attempts are aborted')
      return connectedStream
    })
    .catch(function (error) {
      self._log.error(error.message)
      throw error
    })
}

ParallelScheduler.prototype.calculateConnectTimeout = function (timeouts) {
  return timeouts.reduce(function (a, b) {
    return Math.max(a, b)
  })
}

module.exports = ParallelScheduler
