'use strict'

var AbstractTransport = require('./abstract')
var merge = require('merge')
var myUtils = require('../utils')
var Q = require('q')
var runtime = require('mm-runtime-info')
var turn = require('turn-js')
var TurnSession = require('./session/turn')
var TurnTransports = turn.transports
var TurnClient = turn.TurnClient
var util = require('util')
var winston = require('winston-debug')
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
  // init
  this._args = merge(Object.create(TurnTransport.DEFAULTS), args)
  this._turnProtocol = (args.turnProtocol === undefined) ? new TurnTransports.UDP() : this._args.turnProtocol
  this._turn = turn(
    this._args.turnServer,
    this._args.turnPort,
    this._args.turnUsername,
    this._args.turnPassword,
    this._args._turnProtocol
  )
  this._signaling = this._args.signaling
  // keep track of turn sessions
  this._sessions = {}
  // set init state
  this._state = TurnTransport.STATE.INIT
  // done
  this._log.debug('created ' + this.transportType() + ' transport')
}

// Inherit from abstract transport
util.inherits(TurnTransport, AbstractTransport)

TurnTransport.DEFAULTS = {
  timeoutMargin: 10000,
  connectTimeout: 2000
}

TurnTransport.STATE = {
  INIT: 0,
  ACTIVE: 1,
  CLOSING: 2,
  CLOSED: 3
}

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
  return this._args.connectTimeout
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
      self._state = TurnTransport.STATE.ACTIVE
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
      }
      self._myListeningConnectionInfo = myConnectionInfo
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
  var self = this
  // create session info
  var sessionId = myUtils.generateSessionId()
  var sessionInfo = {
    sessionId: sessionId
  }
  this._sessions[sessionId] = sessionInfo
  // connect to signaling server
  this._signaling.registerP(this._onSignalingMessage.bind(this))
    .then(function (actualRegistrationInfo) {
      // change state
      self._state = TurnTransport.STATE.ACTIVE
      // create connection info
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
      }
      // store connection info for later use when sending signaling messages
      sessionInfo._myConnectionInfo = myConnectionInfo
      // add _disconnectFromSignalingServer function for later use
      sessionInfo._disconnectFromSignalingServer = function (onDisconnectFailure) {
        // close connection with signaling server
        self._signaling.deregister(
          actualRegistrationInfo,
          doNothing,
          onDisconnectFailure
        )
      }
      // execute turn ALLOCATE request
      return self._turn.allocateP()
    })
    .then(function (allocateReply) {
      sessionInfo._srflxAddress = allocateReply.mappedAddress
      sessionInfo._relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        sessionInfo._allocationLifetime = allocateReply.lifetime
      }
      self._log.debug('srflx address = ' + sessionInfo._srflxAddress.address + ':' + sessionInfo._srflxAddress.port)
      self._log.debug('relay address = ' + sessionInfo._relayAddress.address + ':' + sessionInfo._relayAddress.port)
      self._log.debug('lifetime = ' + sessionInfo._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop(sessionInfo)
      // store callbacks for later use
      sessionInfo._connectOnSuccess = onSuccess
      sessionInfo._connectOnFailure = onFailure
      // peer connection info
      sessionInfo._peerConnectionInfo = peerConnectionInfo
      // send connect request to peer
      var signalingDestination = peerConnectionInfo.transportInfo
      var signalingMessage = {
        version: self.version,
        sender: sessionInfo._myConnectionInfo.transportInfo,
        operationType: 'connect',
        sessionId: sessionId,
        operationContent: {
          srflxAddress: sessionInfo._srflxAddress,
          relayAddress: sessionInfo._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      self._log.debug("'connect' message sent")
      // start timer
      var deferred = Q.defer()
      sessionInfo._readyMessageTimeout = setTimeout(function () {
        deferred.reject()
      }, self._args.connectTimeout)
      return deferred.promise
    })
    .catch(function (error) {
      // close connection with signaling server
      sessionInfo._disconnectFromSignalingServer(onFailure)
      // delete session info
      self._deleteTurnSession(sessionInfo)
      // handle error
      self._log.error(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype.abort = function (peerConnectionInfo, onFailure) {
  this._log.debug('aborting handshake with ' + JSON.stringify(peerConnectionInfo))
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
  var sessionInfo
  for (var sessionId in this._sessions) {
    sessionInfo = this._sessions[sessionId]
    if (sessionInfo._peerConnectionInfo === peerConnectionInfo) {
      return
    }
  }
  if (!sessionInfo) {
    var noSessionInfoError = 'cannot find session info for connectionInfo ' + JSON.stringify(peerConnectionInfo.transportType)
    this._log.error(noSessionInfoError)
    this._error(noSessionInfoError, onFailure)
    return
  }
  // close connection with signaling server
  sessionInfo._disconnectFromSignalingServer(onFailure)
  // delete session info
  this._deleteTurnSession(sessionInfo)
}

TurnTransport.prototype.close = function (onSuccess, onFailure) {
  this._log.debug('closing TurnTransport')
  if (myUtils.isEmpty(this._sessions)) {
    this._close(onSuccess)
    return
  }
  this._state = TurnTransport.STATE.CLOSING
  this._onClosingSuccess = onSuccess
  this._onClosingFailure = onFailure
}

TurnTransport.prototype._close = function () {
  if (this._state === TurnTransport.STATE.CLOSED) {
    this._log.debug('TurnTransport already closed, ignoring _close request')
    return
  }
  this._state = TurnTransport.STATE.CLOSED
  var self = this
  // when socket was not connected with signaling server listening for incoming requests
  if (this._myListeningConnectionInfo === undefined) {
    // then we're done
    self._fireCloseEvent(self._onClosingSuccess)
    return
  }
  // otherwise, close connection with signaling server
  this._signaling.deregisterP(this._myListeningConnectionInfo.transportInfo)
    .then(function () {
      self._fireCloseEvent(self._onClosingSuccess)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error, self._onClosingFailure)
    })
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
  var sessionId = message.sessionId
  if (sessionId === undefined) {
    var undefinedSessionIdError = 'incorrect signaling message: undefined sessionId -- ignoring request'
    this._log.error(undefinedSessionIdError)
    this._error(undefinedSessionIdError)
    return
  }
  switch (operationType) {
    case 'connect':
      if (this._acceptIncomingConnections()) {
        this._onConnectRequest(message)
      } else {
        this._log.debug('not accepting new connections -- dropping connect request on the floor')
      }
      break
    case 'ready':
      this._onReadyMessage(message)
      break
    case 'done':
      this._onDoneMessage(message)
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
  // create session info
  var sessionId = message.sessionId
  var sessionInfo = {
    sessionId: sessionId,
    _myConnectionInfo: this._myListeningConnectionInfo
  }
  this._sessions[sessionId] = sessionInfo
  var self = this
  // first allocate TURN resource
  this._turn.allocateP()
    .then(function (allocateReply) {
      sessionInfo._srflxAddress = allocateReply.mappedAddress
      sessionInfo._relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        sessionInfo._allocationLifetime = allocateReply.lifetime
      }
      self._log.debug('srflx address = ' + sessionInfo._srflxAddress.address + ':' + sessionInfo._srflxAddress.port)
      self._log.debug('relay address = ' + sessionInfo._relayAddress.address + ':' + sessionInfo._relayAddress.port)
      self._log.debug('lifetime = ' + sessionInfo._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop(sessionInfo)
      // then create permission for peer to reach me
      return self._turn.createPermissionP(connectRequest.relayAddress.address)
    })
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address, sessionInfo)
      // create and store turn stream/session
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      self._createTurnSession(peerConnectionInfo, self._turn, sessionInfo)
      // peer connection info
      sessionInfo._peerConnectionInfo = peerConnectionInfo
      // send ready response to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: self.version,
        sender: sessionInfo._myConnectionInfo.transportInfo,
        operationType: 'ready',
        sessionId: sessionId,
        operationContent: {
          srflxAddress: sessionInfo._srflxAddress,
          relayAddress: sessionInfo._relayAddress
        }
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      self._log.debug("'ready' message sent")
      // start timer
      var deferred = Q.defer()
      sessionInfo._doneMessageTimeout = setTimeout(function () {
        deferred.reject()
      }, self._args.connectTimeout)
      return deferred.promise
    })
    .catch(function (error) {
      // delete session info
      self._deleteTurnSession(sessionInfo)
      // handle error
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
  var sessionId = message.sessionId
  var sessionInfo = this._sessions[sessionId]
  if (sessionInfo === undefined) {
    var undefinedSessionInfo = 'incorrect signaling message: could not find associated session info -- ignoring request'
    this._log.error(undefinedSessionInfo)
    this._error(undefinedSessionInfo)
    return
  }
  // stop _readyMessageTimeout
  clearTimeout(sessionInfo._readyMessageTimeout)
  // create permission for peer to reach me
  var self = this
  this._turn.createPermissionP(connectRequest.relayAddress.address)
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address, sessionInfo)
      // create turn session
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      var session = self._createTurnSession(peerConnectionInfo, self._turn, sessionInfo)
      // fire connect event
      self._fireConnectEvent(session, sessionInfo._peerConnectionInfo, sessionInfo._connectOnSuccess)
      // send done message to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: self.version,
        sender: sessionInfo._myConnectionInfo.transportInfo,
        operationType: 'done',
        sessionId: sessionId
      }
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .catch(function (error) {
      // close connection with signaling server
      sessionInfo._disconnectFromSignalingServer()
      // delete session info
      self._deleteTurnSession(sessionInfo)
      // handle error
      self._log.error(error)
      self._error(error)
    })
}

TurnTransport.prototype._onDoneMessage = function (message) {
  var sender = message.sender
  if (sender === undefined) {
    var undefinedSenderError = 'incorrect signaling message: undefined sender -- ignoring request'
    this._log.error(undefinedSenderError)
    this._error(undefinedSenderError)
    return
  }
  var sessionId = message.sessionId
  var sessionInfo = this._sessions[sessionId]
  if (sessionInfo === undefined) {
    var undefinedSessionInfo = 'incorrect signaling message: could not find associated session info -- ignoring request'
    this._log.error(undefinedSessionInfo)
    this._error(undefinedSessionInfo)
    return
  }
  // stop _doneMessageTimeout
  clearTimeout(sessionInfo._doneMessageTimeout)
  // fire connection event
  this._fireConnectionEvent(sessionInfo.stream, this, sessionInfo._peerConnectionInfo)
}

TurnTransport.prototype._startRefreshLoop = function (sessionInfo) {
  var self = this
  // start refresh timer if allocation lifetime is specified
  if (sessionInfo._allocationLifetime !== undefined) {
    this._log.debug('activating refresh loop -- lifetime was set to ' + sessionInfo._allocationLifetime)
    this._startRefreshTimer(sessionInfo._allocationLifetime, sessionInfo)
    return
  }
  // otherwise execute refresh operation using the default TURN allocation timeout to retrieve actual lifetime
  this._turn.refreshP(TurnClient.DEFAULT_ALLOCATION_LIFETIME)
    .then(function (lifetime) {
      self._log.debug('activating refresh loop -- allocation lifetime ' + lifetime)
      sessionInfo._allocationLifetime = lifetime
      self._startRefreshTimer(sessionInfo._allocationLifetime, sessionInfo)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

TurnTransport.prototype._startRefreshTimer = function (lifetime, sessionInfo) {
  var self = this
  sessionInfo._refreshTimer = setInterval(function () {
    self._turn.refreshP(lifetime)
      .then(function (duration) {
        self._log.debug('executed refresh operation, retrieving lifetime ' + duration)
      })
      .catch(function (error) {
        clearInterval(sessionInfo._refreshTimer)
        var errorMsg = 'error while sending TURN refresh message: ' + error
        self._log.error(errorMsg)
        self._error(errorMsg)
      })
  }, lifetime * 1000 - this._args.timeoutMargin)
}

TurnTransport.prototype._startCreatePermissionTimer = function (address, sessionInfo) {
  var self = this
  sessionInfo._createPermissionTimer = setInterval(function () {
    self._turn.createPermissionP(address)
      .then(function () {
        self._log.debug('executed create permission refresh')
      })
      .catch(function (error) {
        clearInterval(sessionInfo._createPermissionTimer)
        var errorMsg = 'error while refreshing TURN permission: ' + error
        self._log.error(errorMsg)
        self._error(errorMsg)
      })
  }, TurnClient.CREATE_PERMISSION_LIFETIME * 1000 - this._args.timeoutMargin)
}

TurnTransport.prototype._startChannelBindTimer = function (address, port, channel, sessionInfo) {
  var self = this
  sessionInfo._channelBindTimer = setInterval(function () {
    self._turn.bindChannelP(address, port, channel)
      .then(function (channel) {
        self._log.debug('executed bind channel refresh, retrieving channel ' + channel)
      })
      .catch(function (error) {
        clearInterval(sessionInfo._channelBindTimer)
        var errorMsg = 'failure while refreshing channel binding: ' + error
        self._log.error(errorMsg)
        self._error(errorMsg)
      })
  }, TurnClient.CHANNEL_BINDING_LIFETIME * 1000 - this._args.timeoutMargin)
}

TurnTransport.prototype._createTurnSession = function (peerAddress, turnClient, sessionInfo) {
  // create new TURN session
  var session = new TurnSession(peerAddress, turnClient, sessionInfo.sessionId)
  // store session
  sessionInfo.stream = session
  // register handlers for closing events
  var self = this
  session.once('close', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' closed')
    self._deleteTurnSession(sessionInfo)
    if (myUtils.isEmpty(self._sessions) && self._state === TurnTransport.STATE.CLOSING) {
      self._close()
    }
  })
  session.once('end', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more readable')
    // delete if finished + ended
    if (!session.writable) {
      self._deleteTurnSession(sessionInfo)
      if (myUtils.isEmpty(self._sessions) && self._state === TurnTransport.STATE.CLOSING) {
        self._close()
      }
    }
  })
  session.once('finish', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more writable')
    // delete if finished + ended
    if (!session.readable) {
      self._deleteTurnSession(sessionInfo)
      if (myUtils.isEmpty(self._sessions) && self._state === TurnTransport.STATE.CLOSING) {
        self._close()
      }
    }
  })
  // done
  this._log.debug('created new session for ' + JSON.stringify(peerAddress))
  return session
}

TurnTransport.prototype._deleteTurnSession = function (sessionInfo) {
  // stop all timers
  if (sessionInfo._refreshTimer !== undefined) {
    clearInterval(sessionInfo._refreshTimer)
  }
  if (sessionInfo._createPermissionTimer !== undefined) {
    clearInterval(sessionInfo._createPermissionTimer)
  }
  if (sessionInfo._channelBindTimer !== undefined) {
    clearInterval(sessionInfo._channelBindTimer)
  }
  if (sessionInfo._doneMessageTimeout !== undefined) {
    clearInterval(sessionInfo._doneMessageTimeout)
  }
  if (sessionInfo._readyMessageTimeout !== undefined) {
    clearInterval(sessionInfo._readyMessageTimeout)
  }
  // delete sessionInfo
  delete this._sessions[sessionInfo.sessionId]
}

TurnTransport.prototype._acceptIncomingConnections = function () {
  return this._state === TurnTransport.STATE.ACTIVE
}

function doNothing() {
  // do nothing
}

module.exports = TurnTransport
