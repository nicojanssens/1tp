'use strict'

var events = require('events')
var myUtils = require('../../utils')
var Q = require('q')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function AbstractSignaling () {
  if (!(this instanceof AbstractSignaling)) {
    return new AbstractSignaling()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:out-of-band'
  })
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
}

// Inherit EventEmitter
util.inherits(AbstractSignaling, events.EventEmitter)

AbstractSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.register function not implemented'
  this._log.error(notImplementedYetErrorMsg)
  this._error(notImplementedYetErrorMsg, onFailure)
}

AbstractSignaling.prototype.registerP = function (callback, requestedRegistrationInfo) {
  var deferred = Q.defer()
  this.register(
    callback,
    requestedRegistrationInfo,
    function (finalRegistrationInfo) {
      deferred.resolve(finalRegistrationInfo)
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

AbstractSignaling.prototype.deregister = function (registrationInfo, onSuccess, onFailure) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.deregister function not implemented'
  this._log.error(notImplementedYetErrorMsg)
  this._error(notImplementedYetErrorMsg, onFailure)
}

AbstractSignaling.prototype.deregisterP = function (registrationInfo) {
  var deferred = Q.defer()
  this.deregister(
    registrationInfo,
    function () {
      deferred.resolve()
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

AbstractSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.send function not implemented'
  this._log.error(notImplementedYetErrorMsg)
  this._error(notImplementedYetErrorMsg, onFailure)
}

AbstractSignaling.prototype.sendP = function (message, destinationInfo) {
  var deferred = Q.defer()
  this.send(
    message,
    destinationInfo,
    function () {
      deferred.resolve()
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

AbstractSignaling.prototype.close = function (onSuccess, onFailure) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.close function not implemented'
  this._log.error(notImplementedYetErrorMsg)
  this._error(notImplementedYetErrorMsg, onFailure)
}

AbstractSignaling.prototype.closeP = function () {
  var deferred = Q.defer()
  this.close(
    function () {
      deferred.resolve()
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

module.exports = AbstractSignaling
