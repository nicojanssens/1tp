'use strict'

var AbstractSignaling = require('./abstract')
var hat = require('hat')
var io = require('socket.io-client')
var merge = require('merge')
var util = require('util')

var signalingType = 'websocket-signaling'

var debug = require('debug')
var debugLog = debug('1tp:transports:signaling:websocket')
var errorLog = debug('1tp:transports:signaling:websocket:error')

function WebSocketSignaling (wsOpts) {
  if (!(this instanceof WebSocketSignaling)) {
    return new WebSocketSignaling(wsOpts)
  }
  this._opts = merge(Object.create(WebSocketSignaling.DEFAULTS), wsOpts)
  AbstractSignaling.call(this)
  debugLog('created websocket signaling connector with args ' + JSON.stringify(this._opts))
}

WebSocketSignaling.DEFAULTS = {
  url: 'http://microminion-registrar.herokuapp.com',
  reconnectionDelay: 0,
  reopenDelay: 0,
  forceNewConnection: true
}

// Inherit EventEmitter
util.inherits(WebSocketSignaling, AbstractSignaling)

WebSocketSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var uid, url
  if (this._socket) {
    var onlyOneConnectionError = 'only one connection allowed -- ignoring request'
    errorLog(onlyOneConnectionError)
    onFailure(onlyOneConnectionError)
  }
  if (requestedRegistrationInfo !== undefined) {
    // verify registration info
    if (requestedRegistrationInfo.type !== signalingType) {
      var signalingTypeError = 'incorrect registrationInfo: unexpected transportType -- ignoring request'
      errorLog(signalingTypeError)
      onFailure(signalingTypeError)
      return
    }
    uid = requestedRegistrationInfo.uid
    url = requestedRegistrationInfo.url
  }
  // create random uid if undefined
  uid = uid || this._opts.uid || hat()
  // use default websocket url if undefined
  url = url || this._opts.url
  // create new registration info instance to be returned once registration succeeds
  var registrationInfo = {}
  registrationInfo.type = signalingType
  registrationInfo.uid = uid
  registrationInfo.url = url
  // create socket
  var socket = io.connect(url, {
    'reconnection delay': this._opts.reconnectionDelay,
    'reopen delay': this._opts.reopenDelay,
    'force new connection': this._opts.forceNewConnection
  })
  socket.on('connect', this.onConnected(callback, registrationInfo, onSuccess, onFailure))
  socket.on('disconnect', this.onDisconnected())
  socket.on('signaling', this.onIncomingMessage())
  socket.on('ping', this.onPing())
  this._socket = socket
}

WebSocketSignaling.prototype.deregister = function (registrationInfo, onSuccess, onFailure) {
  if (registrationInfo.type !== signalingType) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    errorLog(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (registrationInfo.uid === undefined) {
    var signalingIdUndefinedError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    errorLog(signalingIdUndefinedError)
    onFailure(signalingIdUndefinedError)
  }
  if (registrationInfo.uid !== this._uid) {
    var signalingIdError = 'incorrect destinationInfo: unknown uid -- ignoring request'
    errorLog(signalingIdError)
    onFailure(signalingIdError)
  }
  // send deregistration message over socket
  var deregistrationMsg = {}
  deregistrationMsg.username = registrationInfo.uid
  var self = this
  this._socket.emit('deregistration',
    deregistrationMsg,
    function (response, message) {
      // failure
      if (response !== '200') {
        var deregistrationError = 'deregistration failure: ' + message
        errorLog(deregistrationError)
        onFailure(deregistrationError)
      }
      // success
      self._callback = undefined
      self._uid = undefined
      onSuccess()
    }
  )
}

WebSocketSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  if (!this._callback) {
    var notRegisteredError = 'cannot send message when socket is not registered -- ignoring request'
    errorLog(notRegisteredError)
    onFailure(notRegisteredError)
  }
  if (destinationInfo.type !== signalingType) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    errorLog(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (destinationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    errorLog(signalingIdError)
    onFailure(signalingIdError)
  }
  var signalingMsg = {}
  signalingMsg.content = message
  signalingMsg.to = destinationInfo.uid
  debugLog('sending message ' + JSON.stringify(signalingMsg))
  this._socket.emit('signaling',
    signalingMsg,
    function (response, message) {
      // failure
      if (response !== '200') {
        var sendError = 'Send error: ' + message
        errorLog(sendError)
        onFailure(sendError)
      }
      // success
      onSuccess()
    }
  )
}

WebSocketSignaling.prototype.close = function (onSuccess, onFailure) {
  if (this._socket.connected) {
    this._socket.disconnect()
    this._socket = undefined
    this._callback = undefined
    this._uid = undefined
    onSuccess()
    return
  }
  debugLog('no connected socket found -- ignoring request')
  onSuccess()
}

WebSocketSignaling.prototype.onIncomingMessage = function () {
  var self = this
  return function (message, reply) {
    debugLog('incoming message ' + JSON.stringify(message))
    if (!self._callback) {
      var noRegisteredCallbackError = 'cannot find callback to pass message -- ignoring request'
      errorLog(noRegisteredCallbackError)
      throw new Error(noRegisteredCallbackError)
    }
    self._callback(message.content)
    reply('200')
  }
}

WebSocketSignaling.prototype.onPing = function () {
  return function (message) {
    console.log('incoming ping ' + JSON.stringify(message))
  }
}

WebSocketSignaling.prototype.onConnected = function (callback, registrationInfo, onSuccess, onFailure) {
  var self = this
  return function () {
    debugLog('connected to ' + self._opts.url)
    // send registration message over socket
    var signalingMessage = {}
    signalingMessage.username = registrationInfo.uid
    self._socket.emit('registration',
      signalingMessage,
      function (response, message) {
        // failure
        if (response !== '200') {
          var registrationError = 'registration failure: ' + message
          errorLog(registrationError)
          onFailure(registrationError)
        }
        // success
        self._callback = callback
        self._uid = registrationInfo.uid
        // done
        onSuccess(registrationInfo)
        debugLog('registration successful -- registrationInfo = ' + JSON.stringify(registrationInfo))
      }
    )
  }
}

WebSocketSignaling.prototype.onDisconnected = function () {
  var self = this
  return function () {
    debugLog('disconnected from ' + self._opts.url)
  }
}

module.exports = WebSocketSignaling
