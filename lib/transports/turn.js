// TODO: stop refresh loops when closing connection

'use strict'

var AbstractTransport = require('./abstract')
var runtime = require('mm-runtime-info')
var turn = require('turn-js')
var TurnSession = require('./streams/turn')
var TurnTransports = turn.transports
var TurnClient = turn.TurnClient
var util = require('util')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

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
  AbstractTransport.call(this)
  // verify runtime compatibility
  if (!TurnTransport.isCompatibleWithRuntime(args)) {
    var errorMsg = 'TURN transport cannot be used on this runtime'
    this._error(errorMsg)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:turn'
  })
  // verify args
  if (
    args.turnServer === undefined ||
    args.turnPort === undefined ||
    args.turnUsername === undefined ||
    args.turnPassword === undefined
  ) {
    var turnArgsError = 'incorrect args: turnServer and/or turnPort and/or turnUsername and/or turnPassword are undefined'
    this._log.error(turnArgsError)
    throw new Error(turnArgsError)
  }
  if (args.signaling === undefined) {
    var signalingArgsError = 'incorrect args: signaling is undefined'
    this._log.error(signalingArgsError)
    throw new Error(signalingArgsError)
  }
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
  this._log.debug('created ' + this.transportType() + ' transport')
}

// Inherit from abstract transport
util.inherits(TurnTransport, AbstractTransport)

TurnTransport.TIMEOUT_MARGIN = 10000

TurnTransport.isCompatibleWithRuntime = function (args) {
  // if udp
  if (args.turnProtocol === undefined ||
    args.turnProtocol instanceof TurnTransports.UDP
  ) {
    return !runtime.isBrowser()
  // if tcp
  } else if (args.turnProtocol instanceof TurnTransports.TCP) {
    return !runtime.isBrowser() && !runtime.isCordovaApp()
  } else {
    throw new Error("don't know how to process turn transport " + args.turnProtocol)
  }
}

TurnTransport.prototype.transportType = function () {
  if (this._turnProtocol instanceof TurnTransports.UDP) {
    return 'turn-udp'
  } else if (this._turnProtocol instanceof TurnTransports.TCP) {
    return 'turn-tcp'
  } else {
    this._error("don't know how to classify turn transport " + this._turnProtocol)
  }
}

TurnTransport.prototype.connectTimeout = function () {
  return 2000
}

TurnTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
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

TurnTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
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
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
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
      self._log.debug('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      self._log.debug('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      self._log.debug('lifetime = ' + self._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop()
      // store callbacks for later use
      self._connectOnSuccess = onSuccess
      self._connectOnFailure = onFailure
      self._peerConnectionInfo = peerConnectionInfo
      // send connect request to peer
      var signalingDestination = peerConnectionInfo.transportInfo
      var signalingMessage = {
        version: self.version,
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
      self._log.debug("'connect' message sent")
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype.blockIncomingConnections = function () {
  this._acceptIncomingConnections = false
}

TurnTransport.prototype._onSignalingMessage = function (message) {
  this._log.debug('receiving signaling message ' + JSON.stringify(message))
  if (message.version === undefined) {
    var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
    this._log.error(undefinedVersionError)
    this._error(undefinedVersionError)
    return
  }
  var operationType = message.operationType
  if (operationType === undefined) {
    var undefinedOperationTypeError = 'incorrect signaling message: undefined operationType -- ignoring request'
    this._log.error(undefinedOperationTypeError)
    this._error(undefinedOperationTypeError)
    return
  }
  switch (operationType) {
    case 'connect':
      if (this._acceptIncomingConnections) {
        this._onConnectRequest(message)
      } else {
        this._log.debug('not accepting new connections -- dropping connect request on the floor')
      }
      break
    case 'ready':
      this._onReadyMessage(message)
      break
    default:
      var unknownOperationTypeError = "incorrect signaling message: don't know how to process operationType " + operationType + ' -- ignoring request'
      this._log.error(unknownOperationTypeError)
      this._error(unknownOperationTypeError)
  }
}

TurnTransport.prototype._onConnectRequest = function (message) {
  var connectRequest = message.operationContent
  if (connectRequest === undefined) {
    var undefinedOperationContentError = 'incorrect signaling message: undefined operationContent -- ignoring request'
    this._log.error(undefinedOperationContentError)
    this._error(undefinedOperationContentError)
    return
  }
  var sender = message.sender
  if (sender === undefined) {
    var undefinedSenderError = 'incorrect signaling message: undefined sender -- ignoring request'
    this._log.error(undefinedSenderError)
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
      self._log.debug('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      self._log.debug('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      self._log.debug('lifetime = ' + self._allocationLifetime)
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
      var stream = new TurnSession(peerConnectionInfo, self._turn)
      // fire connection event
      self._fireConnectionEvent(stream, self, peerConnectionInfo)
      // send ready response to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: self.version,
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
      self._log.debug("'ready' message sent")
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

TurnTransport.prototype._onReadyMessage = function (message) {
  var connectRequest = message.operationContent
  if (connectRequest === undefined) {
    var undefinedOperationContentError = 'incorrect signaling message: undefined operationContent -- ignoring request'
    this._log.error(undefinedOperationContentError)
    this._error(undefinedOperationContentError)
    return
  }
  var sender = message.sender
  if (sender === undefined) {
    var undefinedSenderError = 'incorrect signaling message: undefined sender -- ignoring request'
    this._log.error(undefinedSenderError)
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
      var stream = new TurnSession(peerConnectionInfo, self._turn)
      // fire connect event
      self._fireConnectEvent(stream, self._peerConnectionInfo, self._connectOnSuccess)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshLoop = function () {
  var self = this
  // start refresh timer if allocation lifetime is specified
  if (this._allocationLifetime !== undefined) {
    this._log.debug('activating refresh loop -- lifetime was set to ' + this._allocationLifetime)
    this._startRefreshTimer(this._allocationLifetime)
    return
  }
  // otherwise execute refresh operation using the default TURN allocation timeout to retrieve actual lifetime
  this._turn.refreshP(TurnClient.DEFAULT_ALLOCATION_LIFETIME)
    .then(function (lifetime) {
      self._log.debug('activating refresh loop -- allocation lifetime ' + lifetime)
      self._allocationLifetime = lifetime
      self._startRefreshTimer(self._allocationLifetime)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshTimer = function (lifetime) {
  var self = this
  this._refreshTimer = setInterval(function () {
    self._turn.refreshP(lifetime)
      .then(function (duration) {
        self._log.debug('executed refresh operation, retrieving lifetime ' + duration)
      })
      .catch(function (error) {
        self._stopRefreshTimer()
        var errorMsg = 'error while sending TURN refresh message: ' + error
        self._log.error(errorMsg)
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
        self._log.debug('executed create permission refresh')
      })
      .catch(function (error) {
        self._stopCreatePermissionTimer()
        var errorMsg = 'error while refreshing TURN permission: ' + error
        self._log.error(errorMsg)
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
        self._log.debug('executed bind channel refresh, retrieving channel ' + channel)
      })
      .catch(function (error) {
        self._stopChannelBindTimer()
        var errorMsg = 'failure while refreshing channel binding: ' + error
        self._log.error(errorMsg)
        self._error(errorMsg)
      })
  }, TurnClient.CHANNEL_BINDING_LIFETIME * 1000 - TurnTransport.TIMEOUT_MARGIN)
}

TurnTransport.prototype._stopChannelBindTimer = function () {
  clearInterval(this._channelBindTimer)
}

module.exports = TurnTransport
