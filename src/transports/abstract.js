'use strict'

var events = require('events')
var utils = require('../utils')
var Q = require('q')
var util = require('util')

var debug = require('debug')
var errorLog = debug('1tp:transports:abstract:error')

function AbstractTransport () {
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  utils.mixinEventEmitterErrorFunction(this)
}

// Inherit EventEmitter
util.inherits(AbstractTransport, events.EventEmitter)

AbstractTransport.prototype.transportType = function () {
  var errorMsg = 'AbstractTransport.transportType function not implemented'
  errorLog(errorMsg)
  this._error(errorLog)
}

AbstractTransport.prototype.activate = function (activationInfo, onSuccess, onFailure) {
  var errorMsg = 'AbstractTransport.activate function not implemented'
  errorLog(errorMsg)
  this._error(errorMsg)
}

AbstractTransport.prototype.activateP = function (activationInfo) {
  var deferred = Q.defer()
  this.activate(
    activationInfo,
    function (connectionInfo) {
      deferred.resolve(connectionInfo)
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

AbstractTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  var errorMsg = 'AbstractTransport.connect function not implemented'
  errorLog(errorMsg)
  this._error(errorMsg)
}

AbstractTransport.prototype.connectP = function (peerConnectionInfo) {
  var deferred = Q.defer()
  this.connect(
    peerConnectionInfo,
    function (stream, peerConnectionInfo) {
      stream._peerConnectionInfo = peerConnectionInfo
      deferred.resolve(stream)
    },
    function (error) {
      deferred.reject(error)
    }
  )
  return deferred.promise
}

AbstractTransport.prototype.close = function (onSuccess, onFailure) {
  var errorMsg = 'AbstractTransport.close function not implemented'
  errorLog(errorMsg)
  this._error(errorMsg)
}

AbstractTransport.prototype.closeP = function () {
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

AbstractTransport.prototype._fireActiveEvent = function (myConnectionInfo, callback) {
  if (callback) {
    callback(myConnectionInfo)
    return
  }
  this.emit('active', myConnectionInfo)
}

AbstractTransport.prototype._fireConnectEvent = function (stream, peerConnectionInfo, callback) {
  if (callback) {
    callback(stream, peerConnectionInfo)
    return
  }
  this.emit('connect', stream, peerConnectionInfo)
}

AbstractTransport.prototype._fireConnectionEvent = function (stream, transport, peerConnectionInfo) {
  this.emit('connection', stream, transport, peerConnectionInfo)
}

AbstractTransport.prototype._fireCloseEvent = function (callback) {
  if (callback) {
    callback()
    return
  }
  this.emit('close')
}

module.exports = AbstractTransport
