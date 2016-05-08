'use strict'

var Q = require('q')

function AbstractSignaling () {
}

AbstractSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var notImplementedYetErrorMsg = 'AbstractSignaling.register function not implemented'
  throw new Error(notImplementedYetErrorMsg)
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
  throw new Error(notImplementedYetErrorMsg)
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
  throw new Error(notImplementedYetErrorMsg)
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
  throw new Error(notImplementedYetErrorMsg)
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
