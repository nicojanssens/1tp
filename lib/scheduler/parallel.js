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
          var abortPromise = transport.abortP(endpointInfo)
          return abortPromise
        }
      })
      return Q.all(abortPromises)
    })
    .then(function () {
      self._log.debug('all remaining connection attempts are aborted')
      return connectedStream
    })
    .catch( function (error) {
      if (error.code === OneTpError.CODES.nothingToAbort) {
        return connectedStream
      } else {
        self._log.error(error.message)
        throw error
      }
    })
}

module.exports = ParallelScheduler
