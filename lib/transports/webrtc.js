'use strict'

var AbstractTransport = require('./abstract')
var freeice = require('freeice')
var merge = require('merge')
var myUtils = require('../utils')
var runtime = require('mm-runtime-info')
var SimplePeer = require('simple-peer')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function WebRtcTransport (args) {
  if (!(this instanceof WebRtcTransport)) {
    return new WebRtcTransport(args)
  }
  AbstractTransport.call(this)
  // verify runtime compatibility
  if (!WebRtcTransport.isCompatibleWithRuntime()) {
    var errorMsg = 'WebRtc transport cannot be used on this runtime'
    this._error(errorMsg)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:webrtc'
  })
  // verify signaling args
  if (args.signaling === undefined) {
    var signalingArgsError = 'incorrect args: signaling is undefined'
    this._log.error(signalingArgsError)
    throw new Error(signalingArgsError)
  }
  // merge args
  this._margs = merge(Object.create(WebRtcTransport.DEFAULTS), args)
  try {
    var wrtc = require('wrtc')
    this._log.debug('using wrtc module')
    this._margs.wrtc = wrtc
  } catch (error) {
    this._log.debug('cannot load wrtc module')
  }
  delete this._margs.signaling
  // init
  this._signaling = args.signaling
  this._state = WebRtcTransport.STATE.INIT
  // keep track of udp sessions
  this._sessions = {}
  // done
  this._log.debug('created webrtc transport, config = ' + JSON.stringify(this._margs))
}

// Inherit from abstract transport
util.inherits(WebRtcTransport, AbstractTransport)

WebRtcTransport.DEFAULTS = {
  config: { iceServers: freeice() },
  trickle: false
}

WebRtcTransport.STATE = {
  INIT: 0,
  ACTIVE: 1,
  CLOSING: 2,
  CLOSED: 3
}

WebRtcTransport.isCompatibleWithRuntime = function () {
  return !runtime.onRpi() &&
  !(runtime.isCordovaApp() && runtime.onIDevice())
}

WebRtcTransport.prototype.transportType = function () {
  return 'webrtc'
}

WebRtcTransport.prototype.connectTimeout = function () {
  return 15000
}

WebRtcTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  this._log.debug('listen to ' + JSON.stringify(listeningInfo))
  var requestedRegistrationInfo
  if (listeningInfo !== undefined) {
    // verify listeningInfo
    if (listeningInfo.transportType !== this.transportType()) {
      var transportTypeError = 'incorrect listeningInfo: unexpected transportType -- ignoring request'
      this._log.error(transportTypeError)
      this._error(transportTypeError, onFailure)
      return
    }
    if (listeningInfo.transportInfo === undefined) {
      var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
      this._log.error(transportInfoUndefined)
      this._error(transportInfoUndefined, onFailure)
      return
    }
    requestedRegistrationInfo = listeningInfo.transportInfo
  }
  // register callback with signaling connector
  var self = this
  this._signaling.registerP(this._onSignalingMessage.bind(this), requestedRegistrationInfo)
    .then(function (actualRegistrationInfo) {
      self._state = WebRtcTransport.STATE.ACTIVE
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
      }
      self._myConnectionInfo = myConnectionInfo
      // send 'listening' event
      self._fireListeningEvent(myConnectionInfo, onSuccess)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error, onFailure)
    })
}

WebRtcTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  this._log.debug('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- ignoring request'
    this._log.error(transportTypeError)
    this._error(transportTypeError, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo === undefined) {
    var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
    this._log.error(transportInfoUndefined)
    this._error(transportInfoUndefined, onFailure)
    return
  }
  // register callback with signaling connector
  var self = this
  this._signaling.registerP(this._onSignalingMessage.bind(this))
    .then(function (actualRegistrationInfo) {
      self._state = WebRtcTransport.STATE.ACTIVE
      // create and store my connection info
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
      }
      self._myConnectionInfo = myConnectionInfo
      // create and store session info
      var sessionId = myUtils.generateSessionId()
      self._sessions[sessionId] = {}
      var sessionInfo = self._sessions[sessionId]
      // peer connection info
      sessionInfo._peerConnectionInfo = peerConnectionInfo
      // create simple peer
      self._margs.initiator = true
      sessionInfo._peer = self._createWebRtcSession(self._margs, peerConnectionInfo.transportInfo, sessionId)
      // fire connect event on webrtc connect
      sessionInfo._peer.on('connect', function () {
        // fire connect event
        self._fireConnectEvent(
          sessionInfo._peer,
          sessionInfo._peerConnectionInfo,
          onSuccess
        )
      })
    })
}

WebRtcTransport.prototype.close = function (onSuccess, onFailure) {
  this._log.debug('closing WebRtcTransport')
  this._onClosingSuccess = onSuccess
  this._onClosingFailure = onFailure
  this._state = WebRtcTransport.STATE.CLOSING
  if (myUtils.isEmpty(this._sessions)) {
    this._close()
    return
  }
}

WebRtcTransport.prototype._close = function () {
  if (this._state === WebRtcTransport.STATE.CLOSED) {
    this._log.debug('WebRtcTransport already closed, ignoring _close request')
    return
  }
  this._state = WebRtcTransport.STATE.CLOSED
  var self = this
  this._signaling.deregisterP(this._myConnectionInfo.transportInfo)
    .then(function () {
      self._fireCloseEvent(self._onClosingSuccess)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error, self._onClosingFailure)
    })
}

WebRtcTransport.prototype._sendSignalingMessage = function (signalingDestination, sessionId, onSuccess, onFailure) {
  var self = this
  return function (data) {
    var signalingMessage = {
      version: self.version,
      sender: self._myConnectionInfo.transportInfo,
      sessionId: sessionId,
      data: data
    }
    self._signaling.sendP(signalingMessage, signalingDestination)
      .then(function () {
        self._log.debug(JSON.stringify(signalingMessage) + ' sent to ' + JSON.stringify(signalingDestination))
        if (onSuccess) {
          onSuccess()
        }
      })
      .catch(function (error) {
        self._log.error(error)
        self._error(error, onFailure)
      })
  }
}

WebRtcTransport.prototype._onSignalingMessage = function (message) {
  this._log.debug('receiving signaling message ' + JSON.stringify(message))
  if (message.version === undefined) {
    var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
    this._log.error(undefinedVersionError)
    this._error(undefinedVersionError)
    return
  }
  var data = message.data
  if (data === undefined) {
    var undefinedDataError = 'incorrect signaling message: undefined data -- ignoring request'
    this._log.error(undefinedDataError)
    this._error(undefinedDataError)
    return
  }
  var sessionId = message.sessionId
  if (sessionId === undefined) {
    var undefinedSessionIdError = 'incorrect signaling message: undefined session id -- ignoring request'
    this._log.error(undefinedSessionIdError)
    this._error(undefinedSessionIdError)
    return
  }
  var sessionInfo = this._sessions[sessionId]
  var self = this
  if (sessionInfo === undefined && this._state === WebRtcTransport.STATE.ACTIVE) {
    // create and store session info
    sessionInfo = {}
    this._sessions[sessionId] = sessionInfo
    // create simple peer
    sessionInfo._peer = this._createWebRtcSession(this._margs, message.sender, sessionId)
    // fire connect event on webrtc connect
    sessionInfo._peer.on('connect', function () {
      // fire connection event
      var peerConnectionInfo = message.sender
      self._fireConnectionEvent(sessionInfo._peer, self, peerConnectionInfo)
    })
    this._log.debug('created new peer instance for ' + JSON.stringify(message.sender))
  }
  sessionInfo._peer.signal(data)
}

WebRtcTransport.prototype._createWebRtcSession = function (spArgs, peerTransportInfo, sessionId) {
  var session = new SimplePeer(spArgs)
  session._sessionId = sessionId
  session._streamId = myUtils.generateStreamId()
  session.on('signal', this._sendSignalingMessage(peerTransportInfo, sessionId))
  var self = this
  session.once('close', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' closed')
    delete self._sessions[session._sessionId]
    if (myUtils.isEmpty(self._sessions)) {
      self._close(self._onClosingSuccess)
    }
  })
  session.once('end', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more readable')
    // delete if finished + ended
    if (!session.writable) {
      delete self._sessions[session._sessionId]
      if (myUtils.isEmpty(self._sessions)) {
        self._close(self._onClosingSuccess)
      }
    }
  })
  session.once('finish', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more writable')
    // delete if finished + ended
    if (!session.readable) {
      delete self._sessions[session._sessionId]
      if (myUtils.isEmpty(self._sessions)) {
        self._close(self._onClosingSuccess)
      }
    }
  })
  return session
}

WebRtcTransport.prototype._acceptIncomingConnections = function () {
  return this._state === WebRtcTransport.STATE.ACTIVE
}

module.exports = WebRtcTransport
