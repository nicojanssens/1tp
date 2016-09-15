'use strict'

var AbstractTransport = require('./abstract')
var freeice = require('freeice')
var merge = require('merge')
var runtime = require('../runtime/info')
var SimplePeer = require('simple-peer')
var util = require('util')
var winston = require('winston')
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
  this._listening = false
  // accept new incoming connections
  this._acceptIncomingConnections = true
  // done
  this._log.debug('created webrtc transport, config = ' + JSON.stringify(this._margs))
}

// Inherit from abstract transport
util.inherits(WebRtcTransport, AbstractTransport)

WebRtcTransport.DEFAULTS = {
  config: { iceServers: freeice() },
  trickle: false,
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
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version()
      }
      self._myConnectionInfo = myConnectionInfo
      self._listening = true
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
      // create and store my connection info
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version()
      }
      self._myConnectionInfo = myConnectionInfo
      // store callbacks for later use
      self._connectOnSuccess = onSuccess
      self._connectOnFailure = onFailure
      self._peerConnectionInfo = peerConnectionInfo
      // create simple peer
      self._margs.initiator = true
      process.exit(0)
      self._peer = new SimplePeer(self._margs)
      self._peer.on('signal', self._sendSignalingMessage(peerConnectionInfo.transportInfo, null, onFailure))
      self._peer.on('connect', function () {
        // fire connect event
        self._fireConnectEvent(self._peer, self._peerConnectionInfo, self._connectOnSuccess)
      })
    })
}

WebRtcTransport.prototype._sendSignalingMessage = function (signalingDestination, onSuccess, onFailure) {
  var self = this
  return function (data) {
    var signalingMessage = {
      version: self.version(),
      sender: self._myConnectionInfo.transportInfo,
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
    var undefinedData = 'incorrect signaling message: undefined data -- ignoring request'
    this._log.error(undefinedData)
    this._error(undefinedData)
    return
  }
  if (this._listening) {
    this._peer = new SimplePeer(this._margs)
    var self = this
    this._peer.on('signal', self._sendSignalingMessage(message.sender))
    this._peer.on('connect', function () {
      // fire connection event
      var peerConnectionInfo = message.sender
      self._fireConnectionEvent(self._peer, self, peerConnectionInfo)
    })
    this._log.debug('created new peer instance for ' + JSON.stringify(message.sender))
  }
  this._peer.signal(data)
}

WebRtcTransport.prototype.close = function (onSuccess, onFailure) {
  // TODO
}

module.exports = WebRtcTransport
