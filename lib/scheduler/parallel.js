'use strict'

var AbstractScheduler = require('./abstract')
var Q = require('q')
var util = require('util')
var winston = require('winston')
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

// Inherit EventEmitter
util.inherits(ParallelScheduler, AbstractScheduler)

ParallelScheduler.prototype.connectP = function (connectionAttempts) {
  var connectPromises = connectionAttempts.map(function (transportSpecs) {
    var transport = transportSpecs.transport
    var endpointInfo = transportSpecs.endpointInfo
    var connectPromise = transport.connectP(endpointInfo)
    return connectPromise
  })
  return Q.any(connectPromises)
    .then(function (stream) {
      // TODO: pre-empt remaining connection attempts

      return stream
    })
}
