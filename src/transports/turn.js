// TODO: stop reflresh loop when closing connection

'use strict'

var AbstractTransport = require('./abstract')
var turn = require('turn-js')
var TurnStream = require('./streams/turn')
var TurnTransports = turn.transports
var util = require('util')

var debug = require('debug')
var debugLog = debug('1tp:transports:turn')
var errorLog = debug('1tp:transports:turn:error')

var defaultLifetime = 600

/**
 * Turn transport
 *
 * @constructor
 * @fires TurnTransport#active
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
  this._lifetime = (args.lifetime === undefined) ? defaultLifetime : args.lifetime
  // done
  debugLog('created turn transport')
}

// Inherit EventEmitter
util.inherits(TurnTransport, AbstractTransport)

TurnTransport.prototype.transportType = function () {
  return 'turn'
}

TurnTransport.prototype.activate = function (activationInfo, onSuccess, onFailure) {
  var requestedRegistrationInfo
  if (activationInfo !== undefined) {
    // verify activationInfo
    if (activationInfo.transportType !== this.transportType()) {
      var transportTypeError = 'incorrect activationInfo: unexpected transportType -- ignoring request'
      errorLog(transportTypeError)
      this._error(transportTypeError, onFailure)
      return
    }
    if (activationInfo.transportInfo === undefined) {
      var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
      errorLog(transportInfoUndefined)
      this._error(transportInfoUndefined, onFailure)
      return
    }
    requestedRegistrationInfo = activationInfo.transportInfo
  }
  // register callback with signaling connector
  var self = this
  this._signaling.registerP(this._onSignalingMessage.bind(this), requestedRegistrationInfo)
    .then(function (actualRegistrationInfo) {
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo
      }
      self._myConnectionInfo = myConnectionInfo
      // send 'active' event
      self._fireActiveEvent(myConnectionInfo, onSuccess)
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
  var self = this
  this._turn.allocateP()
    .then(function (allocateAddress) {
      self._srflxAddress = allocateAddress.mappedAddress
      self._relayAddress = allocateAddress.relayedAddress
      debugLog('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      debugLog('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      // store callbacks for later use
      self._connectOnSuccess = onSuccess
      self._connectOnFailure = onFailure
      self._peerConnectionInfo = peerConnectionInfo
      // send connect request to peer
      var signalingDestination = peerConnectionInfo.transportInfo
      var signalingMessage = {
        sender: self._myConnectionInfo.transportInfo,
        operationType: 'connect',
        operationContent: {
          srflxAddress: self._srflxAddress,
          relayAddress: self._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype._onSignalingMessage = function (message) {
  debugLog('receiving signaling message ' + JSON.stringify(message))
  var operationType = message.operationType
  if (operationType === undefined) {
    var undefinedOperationTypeError = 'incorrect signaling message: undefined operationType -- ignoring request'
    errorLog(undefinedOperationTypeError)
    this._error(undefinedOperationTypeError)
    return
  }
  switch (operationType) {
    case 'connect':
      this._onConnectRequest(message)
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
  var operationContent = message.operationContent
  if (operationContent === undefined) {
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
    .then(function (allocateAddress) {
      self._srflxAddress = allocateAddress.mappedAddress
      self._relayAddress = allocateAddress.relayedAddress
      debugLog('srflx address = ' + self._srflxAddress.address + ':' + self._srflxAddress.port)
      debugLog('relay address = ' + self._relayAddress.address + ':' + self._relayAddress.port)
      // then create permission for peer to reach me
      return self._turn.createPermissionP(operationContent.relayAddress.address)
    })
    .then(function () {
      // create duplex stream
      var peerConnectionInfo = {
        mappedAddress: operationContent.srflxAddress,
        relayedAddress: operationContent.relayAddress
      }
      var stream = new TurnStream(peerConnectionInfo, self._turn)
      // fire connection event
      self._fireConnectionEvent(stream, self, peerConnectionInfo)
      // start refresh interval
      self._fireActiveEventRefreshLoop()
      // send ready response to peer
      var signalingDestination = sender
      var signalingMessage = {
        sender: self._myConnectionInfo.transportInfo,
        operationType: 'ready',
        operationContent: {
          srflxAddress: self._srflxAddress,
          relayAddress: self._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

TurnTransport.prototype._onReadyMessage = function (message) {
  var operationContent = message.operationContent
  if (operationContent === undefined) {
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
  this._turn.createPermissionP(operationContent.relayAddress.address)
    .then(function () {
      // create duplex stream
      var peerConnectionInfo = {
        mappedAddress: operationContent.srflxAddress,
        relayedAddress: operationContent.relayAddress
      }
      // start refresh interval
      self._fireActiveEventRefreshLoop()
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

TurnTransport.prototype._fireActiveEventRefreshLoop = function () {
  var self = this
  // execute reflesh operation to correct _lifetime value (if needed)
  this._turn.refreshP(this._lifetime)
    .then(function (duration) {
      debugLog('activating refresh loop -- lifetime was set to ' + duration)
      self._lifetime = duration
      self._startRefreshTimer(duration)
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshTimer = function (duration) {
  var self = this
  this._refreshTimer = setInterval(function () {
    self._turn.refreshP(duration)
      .then(function (duration) {
        // do nothing
      })
      .catch(function (error) {
        self._stopRefreshTimer()
        var errorMsg = 'failure while sending TURN refresh message: ' + error
        errorLog(errorMsg)
        self._error(errorMsg)
      })
  }, duration * 1000 - 5000)
}

TurnTransport.prototype._stopRefreshTimer = function () {
  clearInterval(this._refreshTimer)
}

module.exports = TurnTransport
