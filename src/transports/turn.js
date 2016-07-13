// TODO: stop refresh loops when closing connection

'use strict'

var AbstractTransport = require('./abstract')
var turn = require('turn-js')
var TurnStream = require('./streams/turn')
var TurnTransports = turn.transports
var TurnClient = turn.TurnClient
var util = require('util')

var debug = require('debug')
var debugLog = debug('1tp:transports:turn')
var errorLog = debug('1tp:transports:turn:error')

var version = require('../../package.json').version

/**
 * Turn transport
 *
 * @constructor
 * @fires TurnTransport#listening
 * @fires TurnTransport#connection
 * @fires TurnTransport#connect
 * @fires TurnTransport#error
 * @fires TurnTransport#signaling
 */
function TurnTransport (args) {
  if (!(this instanceof TurnTransport)) {
    return new TurnTransport(args)
  }
  // verify args
  if (
    args.turnServer === undefined ||
    args.turnPort === undefined ||
    args.turnUsername === undefined ||
    args.turnPassword === undefined
  ) {
    var turnArgsError = 'incorrect args: turnServer and/or turnPort and/or turnUsername and/or turnPassword are undefined'
    errorLog(turnArgsError)
    throw new Error(turnArgsError)
  }
  if (args.signaling === undefined) {
    var signalingArgsError = 'incorrect args: signaling is undefined'
    errorLog(signalingArgsError)
    throw new Error(signalingArgsError)
  }
  AbstractTransport.call(this)
  // store args
  this._turnProtocol = (args.turnProtocol === undefined) ? new TurnTransports.UDP() : args.turnProtocol
  this._turn = turn(
    args.turnServer,
    args.turnPort,
    args.turnUsername,
    args.turnPassword,
    this._turnProtocol
  )
  this._signaling = args.signaling
  // accept new incoming connections
  this._acceptIncomingConnections = true
  // done
  debugLog('created turn transport')
}

// Inherit from abstract transport
util.inherits(TurnTransport, AbstractTransport)

TurnTransport.TIMEOUT_MARGIN = 10000

TurnTransport.prototype.transportType = function () {
  return 'turn'
}

TurnTransport.prototype.connectTimeout = function () {
  return 2000
}

TurnTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  var requestedRegistrationInfo
  if (listeningInfo !== undefined) {
    // verify listeningInfo
    if (listeningInfo.transportType !== this.transportType()) {
      var transportTypeError = 'incorrect listeningInfo: unexpected transportType -- ignoring request'
      errorLog(transportTypeError)
      this._error(transportTypeError, onFailure)
      return
    }
    if (listeningInfo.transportInfo === undefined) {
      var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
      errorLog(transportInfoUndefined)
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
        version: version
      }
      self._myConnectionInfo = myConnectionInfo
      // send 'listening' event
      self._fireListeningEvent(myConnectionInfo, onSuccess)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  debugLog('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- ignoring request'
    errorLog(transportTypeError)
    this._error(transportTypeError, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo === undefined) {
    var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
    errorLog(transportInfoUndefined)
    this._error(transportInfoUndefined, onFailure)
    return
  }
  // register callback with signaling connector
  var self = this
  this._signaling.registerP(this._onSignalingMessage.bind(this))
    .then(function (actualRegistrationInfo) {
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: version
      }
      self._myConnectionInfo = myConnectionInfo
      return self._turn.allocateP()
    })
    .then(function (allocateReply) {
      self._srflxAddress = allocateReply.mappedAddress
      self._relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        self._allocationLifetime = allocateReply.lifetime
      }
      debugLog('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      debugLog('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      debugLog('lifetime = ' + self._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop()
      // store callbacks for later use
      self._connectOnSuccess = onSuccess
      self._connectOnFailure = onFailure
      self._peerConnectionInfo = peerConnectionInfo
      // send connect request to peer
      var signalingDestination = peerConnectionInfo.transportInfo
      var signalingMessage = {
        version: version,
        sender: self._myConnectionInfo.transportInfo,
        operationType: 'connect',
        operationContent: {
          srflxAddress: self._srflxAddress,
          relayAddress: self._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      debugLog("'connect' message sent")
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype.blockIncomingConnections = function () {
  this._acceptIncomingConnections = false
}

TurnTransport.prototype._onSignalingMessage = function (message) {
  debugLog('receiving signaling message ' + JSON.stringify(message))
  if (message.version === undefined) {
    var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
    errorLog(undefinedVersionError)
    this._error(undefinedVersionError)
    return
  }
  var operationType = message.operationType
  if (operationType === undefined) {
    var undefinedOperationTypeError = 'incorrect signaling message: undefined operationType -- ignoring request'
    errorLog(undefinedOperationTypeError)
    this._error(undefinedOperationTypeError)
    return
  }
  switch (operationType) {
    case 'connect':
      if (this._acceptIncomingConnections) {
        this._onConnectRequest(message)
      } else {
        debugLog('not accepting new connections -- dropping connect request on the floor')
      }
      break
    case 'ready':
      this._onReadyMessage(message)
      break
    default:
      var unknownOperationTypeError = "incorrect signaling message: don't know how to process operationType " + operationType + ' -- ignoring request'
      errorLog(unknownOperationTypeError)
      this._error(unknownOperationTypeError)
  }
}

TurnTransport.prototype._onConnectRequest = function (message) {
  var connectRequest = message.operationContent
  if (connectRequest === undefined) {
    var undefinedOperationContentError = 'incorrect signaling message: undefined operationContent -- ignoring request'
    errorLog(undefinedOperationContentError)
    this._error(undefinedOperationContentError)
    return
  }
  var sender = message.sender
  if (sender === undefined) {
    var undefinedSenderError = 'incorrect signaling message: undefined sender -- ignoring request'
    errorLog(undefinedSenderError)
    this._error(undefinedSenderError)
    return
  }
  var self = this
  // first allocate TURN resource
  this._turn.allocateP()
    .then(function (allocateReply) {
      self._srflxAddress = allocateReply.mappedAddress
      self._relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        self._allocationLifetime = allocateReply.lifetime
      }
      debugLog('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      debugLog('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      debugLog('lifetime = ' + self._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop()
      // then create permission for peer to reach me
      return self._turn.createPermissionP(connectRequest.relayAddress.address)
    })
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address)
      // create duplex stream
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      var stream = new TurnStream(peerConnectionInfo, self._turn)
      // fire connection event
      self._fireConnectionEvent(stream, self, peerConnectionInfo)
      // send ready response to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: message.version,
        sender: self._myConnectionInfo.transportInfo,
        operationType: 'ready',
        operationContent: {
          srflxAddress: self._srflxAddress,
          relayAddress: self._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      debugLog("'ready' message sent")
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

TurnTransport.prototype._onReadyMessage = function (message) {
  var connectRequest = message.operationContent
  if (connectRequest === undefined) {
    var undefinedOperationContentError = 'incorrect signaling message: undefined operationContent -- ignoring request'
    errorLog(undefinedOperationContentError)
    this._error(undefinedOperationContentError)
    return
  }
  var sender = message.sender
  if (sender === undefined) {
    var undefinedSenderError = 'incorrect signaling message: undefined sender -- ignoring request'
    errorLog(undefinedSenderError)
    this._error(undefinedSenderError)
    return
  }
  var self = this
  // create permission for peer to reach me
  this._turn.createPermissionP(connectRequest.relayAddress.address)
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address)
      // create duplex stream
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      // create duplex stream
      var stream = new TurnStream(peerConnectionInfo, self._turn)
      // fire connect event
      self._fireConnectEvent(stream, self._peerConnectionInfo, self._connectOnSuccess)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshLoop = function () {
  var self = this
  // start refresh timer if allocation lifetime is specified
  if (this._allocationLifetime !== undefined) {
    debugLog('activating refresh loop -- lifetime was set to ' + this._allocationLifetime)
    this._startRefreshTimer(this._allocationLifetime)
    return
  }
  // otherwise execute refresh operation using the default TURN allocation timeout to retrieve actual lifetime
  this._turn.refreshP(TurnClient.DEFAULT_ALLOCATION_LIFETIME)
    .then(function (lifetime) {
      debugLog('activating refresh loop -- allocation lifetime ' + lifetime)
      self._allocationLifetime = lifetime
      self._startRefreshTimer(self._allocationLifetime)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshTimer = function (lifetime) {
  var self = this
  this._refreshTimer = setInterval(function () {
    self._turn.refreshP(lifetime)
      .then(function (duration) {
        debugLog('executed refresh operation, retrieving lifetime ' + duration)
      })
      .catch(function (error) {
        self._stopRefreshTimer()
        var errorMsg = 'error while sending TURN refresh message: ' + error
        errorLog(errorMsg)
        self._error(errorMsg)
      })
  }, lifetime * 1000 - TurnTransport.TIMEOUT_MARGIN)
}

TurnTransport.prototype._stopRefreshTimer = function () {
  clearInterval(this._refreshTimer)
}

TurnTransport.prototype._startCreatePermissionTimer = function (address) {
  var self = this
  this._createPermissionTimer = setInterval(function () {
    self._turn.createPermissionP(address)
      .then(function () {
        debugLog('executed create permission refresh')
      })
      .catch(function (error) {
        self._stopCreatePermissionTimer()
        var errorMsg = 'error while refreshing TURN permission: ' + error
        errorLog(errorMsg)
        self._error(errorMsg)
      })
  }, TurnClient.CREATE_PERMISSION_LIFETIME * 1000 - TurnTransport.TIMEOUT_MARGIN)
}

TurnTransport.prototype._stopCreatePermissionTimer = function () {
  clearInterval(this._createPermissionTimer)
}

TurnTransport.prototype._startChannelBindTimer = function (address, port, channel) {
  var self = this
  this._channelBindTimer = setInterval(function () {
    self._turn.bindChannelP(address, port, channel)
      .then(function (channel) {
        debugLog('executed bind channel refresh, retrieving channel ' + channel)
      })
      .catch(function (error) {
        self._stopChannelBindTimer()
        var errorMsg = 'failure while refreshing channel binding: ' + error
        errorLog(errorMsg)
        self._error(errorMsg)
      })
  }, TurnClient.CHANNEL_BINDING_LIFETIME * 1000 - TurnTransport.TIMEOUT_MARGIN)
}

TurnTransport.prototype._stopChannelBindTimer = function () {
  clearInterval(this._channelBindTimer)
}

module.exports = TurnTransport
