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
    module: '1tp:scheduler:sequential'
  })
  // init
  AbstractScheduler.call(this)
}

// Inherit EventEmitter
util.inherits(ParallelScheduler, AbstractScheduler)

ParallelScheduler.prototype.connectP = function (connectionAttempts) {

}
