'use strict'

var AbstractTransport = require('./abstract')
var EventEmitter = require('events').EventEmitter
var merge = require('merge')
var myUtils = require('../utils')
var OneTpError = require('../error')
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
  LISTENING: 1,
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
      self._state = TurnTransport.STATE.LISTENING
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
  var sessionInfo = new EventEmitter()
  sessionInfo.sessionInd = sessionId
  this._sessions[sessionId] = sessionInfo
  // connect to signaling server
  this._signaling.registerP(this._onSignalingMessage.bind(this))
    .then(function (actualRegistrationInfo) {
      // create connection info
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: actualRegistrationInfo,
        version: self.version
      }
      // store connection info for later use when sending signaling messages
      sessionInfo.myConnectionInfo = myConnectionInfo
      // create turn client and add to sessionInfo
      sessionInfo.turnClient = self._createTurnClient()
      // execute turn ALLOCATE request
      return sessionInfo.turnClient.allocateP()
    })
    .then(function (allocateReply) {
      sessionInfo.emit('allocation')
      sessionInfo.srflxAddress = allocateReply.mappedAddress
      sessionInfo.relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        sessionInfo._allocationLifetime = allocateReply.lifetime
      }
      self._log.debug('srflx address = ' + sessionInfo.srflxAddress.address + ':' + sessionInfo.srflxAddress.port)
      self._log.debug('relay address = ' + sessionInfo.relayAddress.address + ':' + sessionInfo.relayAddress.port)
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
        sender: sessionInfo.myConnectionInfo.transportInfo,
        operationType: 'connect',
        sessionId: sessionId,
        operationContent: {
          srflxAddress: sessionInfo.srflxAddress,
          relayAddress: sessionInfo.relayAddress
        }
      }
      self._log.debug('sending CONNECT message')
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      self._log.debug('CONNECT message sent')
      // start timer
      var deferred = Q.defer()
      sessionInfo._readyMessageTimeout = setTimeout(function () {
        var messageTimeout = 'READY message timeout'
        deferred.reject(messageTimeout)
      }, self._args.connectTimeout)
      return deferred.promise
    })
    .catch(function (connectError) {
      self._log.error(connectError)
      // close turn client
      sessionInfo.turnClient.closeP()
        .then(function () {
          // close connection with signaling server
          return self._signaling.deregisterP(sessionInfo.myConnectionInfo.transportInfo)
        })
        .then(function () {
          // delete session info
          self._deleteTurnSession(sessionInfo)
          // fire handshake aborted error
          var handshakeAbortedError = new OneTpError(OneTpError.CODES.handshakeAborted, 'handshake aborted')
          self._error(handshakeAbortedError, onFailure)
        })
        .catch(function (deregistrationError) {
          // handle deregistration error
          self._log.error(deregistrationError)
          self._error(deregistrationError, onFailure)
        })
    })
}

TurnTransport.prototype.abort = function (peerConnectionInfo, onSuccess, onFailure) {
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
      break
    }
  }
  if (!sessionInfo) {
    var noSessionInfoMessage = 'cannot find session info for connectionInfo ' + JSON.stringify(peerConnectionInfo)
    this._log.error(noSessionInfoMessage)
    this._error(new OneTpError(OneTpError.CODES.nothingToAbort, noSessionInfoMessage), onFailure)
    return
  }
  // close turn client
  var self = this
  this._waitUntilTurnClientIsReadyToCloseP(sessionInfo)
    .then(function () {
      return sessionInfo.turnClient.closeP()
    })
    .then(function () {
      // close connection with signaling server
      return self._signaling.deregisterP(sessionInfo.myConnectionInfo.transportInfo)
    })
    .then(function () {
      // delete session info
      self._deleteTurnSession(sessionInfo)
      // done
      self._log.debug('handshake aborted')
      onSuccess()
    })
    .catch(function (error) {
      // handle deregistration error
      self._log.error(error)
      self._error(error, onFailure)
    })
}

TurnTransport.prototype.close = function (onSuccess, onFailure) {
  this._log.debug('closing TurnTransport')
  this._state = TurnTransport.STATE.CLOSING
  this._onClosingSuccess = onSuccess
  this._onClosingFailure = onFailure
  if (myUtils.isEmpty(this._sessions)) {
    this._close()
    return
  }
}

TurnTransport.prototype._close = function () {
  if (this._state === TurnTransport.STATE.CLOSED) {
    this._log.debug('TurnTransport already closed, ignoring _close request')
    return
  }
  this._state = TurnTransport.STATE.CLOSED
  // when socket was not connected with signaling server listening for incoming requests
  if (this._myListeningConnectionInfo === undefined) {
    // then we're done
    this._fireCloseEvent(this._onClosingSuccess)
    return
  }
  // otherwise, close connection with signaling server
  var self = this
  this._signaling.deregisterP(this._myListeningConnectionInfo.transportInfo)
    .then(function () {
      self._fireCloseEvent(self._onClosingSuccess)
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error, self._onClosingFailure)
    })
}

TurnTransport.prototype._createTurnClient = function () {
  return turn(
    this._args.turnServer,
    this._args.turnPort,
    this._args.turnUsername,
    this._args.turnPassword,
    this._args._turnProtocol
  )
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
  var sessionInfo = new EventEmitter()
  sessionInfo.sessionId = sessionId
  sessionInfo.myConnectionInfo = this._myListeningConnectionInfo
  this._sessions[sessionId] = sessionInfo
  var self = this
  // create turn client and add to sessionInfo
  sessionInfo.turnClient = this._createTurnClient()
  // first allocate TURN resource
  sessionInfo.turnClient.allocateP()
    .then(function (allocateReply) {
      sessionInfo.emit('allocation')
      sessionInfo.srflxAddress = allocateReply.mappedAddress
      sessionInfo.relayAddress = allocateReply.relayedAddress
      if (allocateReply.lifetime !== undefined) {
        sessionInfo._allocationLifetime = allocateReply.lifetime
      }
      self._log.debug('srflx address = ' + sessionInfo.srflxAddress.address + ':' + sessionInfo.srflxAddress.port)
      self._log.debug('relay address = ' + sessionInfo.relayAddress.address + ':' + sessionInfo.relayAddress.port)
      self._log.debug('lifetime = ' + sessionInfo._allocationLifetime)
      // start refresh interval
      self._startRefreshLoop(sessionInfo)
      // then create permission for peer to reach me
      return sessionInfo.turnClient.createPermissionP(connectRequest.relayAddress.address)
    })
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address, sessionInfo)
      // create and store turn stream/session
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      self._createTurnSession(peerConnectionInfo, sessionInfo.turnClient, sessionInfo)
      // peer connection info
      sessionInfo._peerConnectionInfo = peerConnectionInfo
      // send ready response to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: self.version,
        sender: sessionInfo.myConnectionInfo.transportInfo,
        operationType: 'ready',
        sessionId: sessionId,
        operationContent: {
          srflxAddress: sessionInfo.srflxAddress,
          relayAddress: sessionInfo.relayAddress
        }
      }
      self._log.debug('sending READY message')
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      self._log.debug('READY message sent')
      // start timer
      var deferred = Q.defer()
      sessionInfo._doneMessageTimeout = setTimeout(function () {
        var messageTimeout = 'DONE message timeout'
        deferred.reject(messageTimeout)
      }, self._args.connectTimeout)
      return deferred.promise
    })
    .catch(function (connectError) {
      self._log.error(connectError)
      // close turn client
      sessionInfo.turnClient.closeP()
        .then(function () {
          // delete session info
          self._deleteTurnSession(sessionInfo)
          // handle connect error
          self._log.error(connectError)
        // don't raise error, this is 'normal' behavior
        })
        .catch(function (deregistrationError) {
          // handle deregistration error
          self._log.error(deregistrationError)
          self._error(deregistrationError)
        })
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
    this._log.debug(undefinedSessionInfo)
    // no error, as this can happen when a handshake was aborted -- silently drop message on the floor
    return
  }
  // stop _readyMessageTimeout
  clearTimeout(sessionInfo._readyMessageTimeout)
  // create permission for peer to reach me
  var self = this
  sessionInfo.turnClient.createPermissionP(connectRequest.relayAddress.address)
    .then(function () {
      // start permission refresh timer
      self._startCreatePermissionTimer(connectRequest.relayAddress.address, sessionInfo)
      // create turn session
      var peerConnectionInfo = {
        mappedAddress: connectRequest.srflxAddress,
        relayedAddress: connectRequest.relayAddress
      }
      var session = self._createTurnSession(peerConnectionInfo, sessionInfo.turnClient, sessionInfo)
      // fire connect event
      self._fireConnectEvent(session, sessionInfo._peerConnectionInfo, sessionInfo._connectOnSuccess)
      // send done message to peer
      var signalingDestination = sender
      var signalingMessage = {
        version: self.version,
        sender: sessionInfo.myConnectionInfo.transportInfo,
        operationType: 'done',
        sessionId: sessionId
      }
      self._log.debug('sending DONE message')
      return self._signaling.sendP(signalingMessage, signalingDestination)
    })
    .then(function () {
      self._log.debug('DONE message sent')
    })
    .catch(function (turnError) {
      // close turn client
      sessionInfo.turnClient.closeP()
        .then(function () {
          // close connection with signaling server
          return self._signaling.deregisterP(sessionInfo.myConnectionInfo.transportInfo)
        })
        .then(function () {
          // delete session info
          self._deleteTurnSession(sessionInfo)
          // handle connect error
          self._log.error(turnError)
          self._error(turnError, sessionInfo._connectOnFailure)
        })
        .catch(function (deregistrationError) {
          // handle deregistration error
          self._log.error(deregistrationError)
          self._error(deregistrationError, sessionInfo._connectOnFailure)
        })
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
    this._log.debug(undefinedSessionInfo)
    // do not fire error event, silently drop message on the floor
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
  sessionInfo.turnClient.refreshP(TurnClient.DEFAULT_ALLOCATION_LIFETIME)
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
    sessionInfo.turnClient.refreshP(lifetime)
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
    sessionInfo.turnClient.createPermissionP(address)
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
    sessionInfo.turnClient.bindChannelP(address, port, channel)
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
  this._log.debug('deleting turn session ' + sessionInfo.sessionId)
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
    clearTimeout(sessionInfo._doneMessageTimeout)
  }
  if (sessionInfo._readyMessageTimeout !== undefined) {
    clearTimeout(sessionInfo._readyMessageTimeout)
  }
  // delete sessionInfo
  delete this._sessions[sessionInfo.sessionId]
}

TurnTransport.prototype._acceptIncomingConnections = function () {
  return this._state === TurnTransport.STATE.LISTENING
}

TurnTransport.prototype._getSessionInfo = function (peerConnectionInfo, onResult, attempts) {
  // set retries if undefined
  if (attempts === undefined) {
    attempts = 5
  }
  // done if no more attempts left
  if (attempts === 0) {
    onResult()
    return
  }
  // try to find sessionInfo object
  var sessionInfo
  for (var sessionId in this._sessions) {
    sessionInfo = this._sessions[sessionId]
    if (sessionInfo._peerConnectionInfo === peerConnectionInfo) {
      break
    }
  }
  // if sessionInfo object is found
  if (sessionInfo !== undefined) {
    // done
    onResult(sessionInfo)
    return
  }
  // otherwise wait and try again
  var self = this
  setTimeout(function () {
    return self._getSessionInfo(peerConnectionInfo, onResult, attempts - 1)
  }, 200)
}

TurnTransport.prototype._waitUntilTurnClientIsReadyToCloseP = function (sessionInfo) {
  this._log.debug('verifying if turn client can be closed')
  // init
  var deferred = Q.defer()
  var self = this
  var delay = 1000
  // resolve if sessionInfo.srflxAddress is defined (indicating that allocate did complete)
  if (sessionInfo.srflxAddress !== undefined) {
    var readyMsg = 'turn client allocation complete, ready to roll'
    this._log.debug(readyMsg)
    deferred.resolve()
  } else {
    var timeout = setTimeout(function () {
      var timeoutMessage = 'timeout while waiting for turn client to complete allocation operation'
      self._log.debug(timeoutMessage)
      deferred.reject()
    }, delay)
    // wait until allocation completes
    sessionInfo.on('allocation', function () {
      clearTimeout(timeout)
      var readyMsg = 'turn client completed allocation, ready to roll'
      self._log.debug(readyMsg)
      deferred.resolve()
    })
  }
  // done
  return deferred.promise
}

module.exports = TurnTransport
