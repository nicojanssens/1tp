'use strict'

var AbstractTransport = require('./abstract')
var dgram = require('dgram')
var merge = require('merge')
var myUtils = require('../utils')
var nicAddresses = require('./addresses/nic')
var runtime = require('mm-runtime-info')
var signalingFactory = require('../signaling/in-band/factory')
var UdpSession = require('./session/udp')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

/**
 * Udp transport
 *
 * @constructor
 * @fires UdpTransport#listening
 * @fires UdpTransport#connection
 * @fires UdpTransport#connect
 * @fires UdpTransport#close
 * @fires UdpTransport#error
 */
function UdpTransport (args) {
  if (!(this instanceof UdpTransport)) {
    return new UdpTransport(args)
  }
  AbstractTransport.call(this)
  // verify runtime compatibility
  if (!UdpTransport.isCompatibleWithRuntime()) {
    var errorMsg = 'UDP transport cannot be used on this runtime'
    this._error(errorMsg)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:udp'
  })
  // create and configure dgram socket
  this._args = merge(Object.create(UdpTransport.DEFAULTS), args)
  this._args.retransmissionDelay = Math.floor(this._args.connectTimeout / this._args.signalingRetransmissions)
  this._createNewDgramSocket()
  // keep track of udp sessions
  this._sessions = {}
  // done
  this._log.debug('created udp transport with args ' + JSON.stringify(this._args))
}

// Inherit from abstract transport
util.inherits(UdpTransport, AbstractTransport)

UdpTransport.DEFAULTS = {
  type: 'udp4',
  reuseAddr: false,
  connectTimeout: 750,
  signalingRetransmissions: 5
}

UdpTransport.STATE = {
  INIT: 0,
  LISTENING: 1,
  CLOSING: 2,
  CLOSED: 3
}

UdpTransport.isCompatibleWithRuntime = function () {
  return !runtime.isBrowser()
}

UdpTransport.prototype.transportType = function () {
  return 'udp'
}

UdpTransport.prototype.connectTimeout = function () {
  return 1000
}

UdpTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  this._log.debug('listen to ' + JSON.stringify(listeningInfo))
  var port = 0
  var address = '0.0.0.0'
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
    port = listeningInfo.transportInfo.port
    address = listeningInfo.transportInfo.address
  }
  var self = this
  // prepare to process errors during bind operation
  var onBindError = function (error) {
    self._createNewDgramSocket() // otherwise chrome-dgram complains that this socket is already bound when we try again (i.e. without listeningInfo)
    self._error(error, onFailure)
  }
  // mute existing error listeners during bind operation
  this._muteSocketErrorListeners = true
  // register temp error listener
  this._socket.once('error', onBindError)
  // fire up
  this._socket.bind(port, address, function () {
    // drop error listener
    self.removeListener('error', onBindError)
    // unmute existing error listeners
    self._muteSocketErrorListeners = false
    // change bind state
    self._state = UdpTransport.STATE.LISTENING
    // create connection info
    var myConnectionInfo = {
      transportType: self.transportType(),
      transportInfo: {
        // address will be added below
        port: self._socket.address().port
      },
      version: self.version
    }
    // if address was specified in listening info, then reuse it
    if (address !== '0.0.0.0') {
      myConnectionInfo.transportInfo.address = self._socket.address().address
      self._myConnectionInfo = myConnectionInfo
      self._log.debug('udp socket bound, connectionInfo = ' + JSON.stringify(myConnectionInfo))
      self._fireListeningEvent(myConnectionInfo, onSuccess)
    } else {
      // otherwise, retrieve local ip address
      nicAddresses.getIpAddressesP()
        .then(function (addresses) {
          var myConnectionInfos = addresses.map(function (localAddress) {
            var connectionInfo = {
              transportType: myConnectionInfo.transportType,
              transportInfo: {
                address: localAddress,
                // INVARIANT thomasdelaet: port numbers must be the same when creating separate transport info instances for different local ipAddresses
                port: myConnectionInfo.transportInfo.port
              },
              version: self.version
            }
            return connectionInfo
          })
          self._log.debug('udp socket bound, connectionInfo = ' + JSON.stringify(myConnectionInfos))
          self._fireListeningEvent(myConnectionInfos, onSuccess)
        })
        .catch(function (error) {
          self._error(error, onFailure)
        })
    }
  })
}

UdpTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  this._log.debug('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- Ignoring request'
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
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    this._log.error(addressError)
    this._error(addressError, onFailure)
    return
  }
  // create new session
  var session = this._createUdpSession(peerConnectionInfo.transportInfo, null)
  // and init handshake
  var self = this
  session.initHandshakeP()
    .then(function () {
      // fire connect event
      self._fireConnectEvent(session, peerConnectionInfo, onSuccess)
    })
    .catch(function (handShakeError) {
      self._log.debug('handshake failure ' + handShakeError)
      // if error does not originate from abort operation
      if (!handShakeError.message.includes('aborted')) {
        // then abort handshake init
        self._log.debug('abort handshake')
        self.abortP(peerConnectionInfo)
          .then(function () {
            var abortCompleteMessage = 'handshake aborted'
            self._log.debug(abortCompleteMessage)
            self._error(new Error(abortCompleteMessage), onFailure)
          })
          .catch(function (abortError) {
            // fire error event
            self._error(abortError, onFailure)
          })
      } else {
        // session is already aborted, resolve
        self._log.debug('do not abort handshake')
        return
      }
    })
}

UdpTransport.prototype.abort = function (peerConnectionInfo, onSuccess, onFailure) {
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
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    this._log.error(addressError)
    this._error(addressError, onFailure)
    return
  }
  // obtain session object
  var session = this._getSession(peerConnectionInfo)
  // when no session found, raise an exception
  if (session === undefined) {
    var noSessionError = 'cannot find session for connectionInfo ' + JSON.stringify(peerConnectionInfo)
    this._log.error(noSessionError)
    this._error(noSessionError, onFailure)
    return
  }
  // abort handshake init
  session.abortHandshake()
  // delete session
  delete this._sessions[session._sessionId]
  // done
  onSuccess()
}

UdpTransport.prototype.close = function (onSuccess, onFailure) {
  this._log.debug('closing UdpTransport')
  if (myUtils.isEmpty(this._sessions)) {
    this._close(onSuccess)
    return
  }
  this._state = UdpTransport.STATE.CLOSING
  this._onClosingSuccess = onSuccess
}

UdpTransport.prototype._close = function (onClosed) {
  if (this._state === UdpTransport.STATE.CLOSED) {
    this._log.debug('UdpTransport already closed, ignoring _close request')
    return
  }
  this._state = UdpTransport.STATE.CLOSED
  var self = this
  this._fireCloseEvent(onClosed)
  // wait for retransmissions of RST or FIN before closing the socket
  setTimeout(function () {
    self._socket.close()
  }, 10000)
}

UdpTransport.prototype._createNewDgramSocket = function () {
  this._socket = dgram.createSocket(this._args)
  this._state = UdpTransport.STATE.INIT
  this._muteSocketErrorListeners = false
  var self = this
  this._socket.on('message', function (bytes, rinfo) {
    self._onIncomingBytes(bytes, rinfo)
  })
  this._socket.on('close', function () {
    if (self._state === UdpTransport.STATE.CLOSED) {
      return
    }
    var socketClosedMsg = 'udp socket closed'
    self._log.error(socketClosedMsg)
    self._error(socketClosedMsg)
  })
  this._socket.on('error', function (error) {
    if (self._muteSocketErrorListeners) {
      return
    }
    self._log.error(error)
    self._error(error)
  })
}

UdpTransport.prototype._getSession = function (peerConnectionInfo) {
  for (var sessionId in this._sessions) {
    var session = this._sessions[sessionId]
    if (session._peerAddress === peerConnectionInfo.transportInfo) {
      return session
    }
  }
}

UdpTransport.prototype._onIncomingBytes = function (bytes, rinfo) {
  this._log.debug('incoming bytes ' + JSON.stringify(bytes) + ' from ' + JSON.stringify(rinfo))
  var message = signalingFactory.parse(bytes)
  // drop requests with no version info
  if (message.version === undefined) {
    var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
    this._log.error(undefinedVersionError)
    this._error(undefinedVersionError)
    return
  }
  // drop SYN requests when this transport is closed -- i.e. it doesn't accepts incoming connections
  if (message.type === signalingFactory.MESSAGE.SYN && !this._acceptIncomingConnections()) {
    var notAcceptingNewConnectionsError = 'not accepting new connections -- ignoring request'
    this._log.debug(notAcceptingNewConnectionsError)
    return
  }
  var self = this
  // create new udp session object when SYN request and transport is not closed
  if (message.type === signalingFactory.MESSAGE.SYN && this._acceptIncomingConnections()) {
    var peerAddress = {
      address: rinfo.address,
      port: rinfo.port
    }
    // create new udp session
    var session = this._createUdpSession(peerAddress, message.sessionId)
    if (!session) {
      // or obtain the existing session
      session = this._sessions[message.sessionId]
    }
    // and notify all listeners once this session is ready to use
    var peerConnectionInfo = {
      transportType: this.transportType(),
      transportInfo: peerAddress
    }
    session.once('connected', function () {
      self._fireConnectionEvent(session, self, peerConnectionInfo)
    })
  }
  // get session
  var thisSession = this._sessions[message.sessionId]
  // drop message if session is undefined
  if (!thisSession) {
    var sessionNotFoundError = 'could not find UDP session for session ' + message.sessionId + ' -- ignoring request'
    this._log.debug(sessionNotFoundError)
    return
  }
  // process valid message and delete session in case of error
  function _onFailure (error) {
    var messageProcessingError = 'could not process message' + message + ', error = ' + error
    self._log.debug(messageProcessingError)
    self._error(messageProcessingError)
    delete self._sessions[message.sessionId]
  }
  thisSession.processMessage(message, _onFailure)
}

UdpTransport.prototype._createUdpSession = function (peerAddress, sessionId) {
  var sessionAlreadyExists = (sessionId !== null && (sessionId in this._sessions))
  if (sessionAlreadyExists) {
    this._log.debug('session ' + sessionId + ' already exists')
  }
  var blockIncomingConnections = (sessionId !== null && !this._acceptIncomingConnections())
  if (blockIncomingConnections) {
    this._log.debug('blocking incoming session requests')
  }
  if (sessionAlreadyExists || blockIncomingConnections) {
    return
  }
  // create new udp session
  var session = new UdpSession(peerAddress, sessionId, this._socket, {
    retransmissionDelay: this._args.retransmissionDelay,
    retries: this._args.signalingRetransmissions
  })
  // store session
  this._sessions[session._sessionId] = session
  // register handlers for closing events
  var self = this
  session.once('close', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' closed')
    // make sure other listeners are triggered first
    process.nextTick(function () {
      delete self._sessions[session._sessionId]
      if (myUtils.isEmpty(self._sessions) && self._state === UdpTransport.STATE.CLOSING) {
        self._close(self._onClosingSuccess)
      }
    })
  })
  session.once('end', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more readable')
    // make sure other listeners are triggered first
    process.nextTick(function () {
      // delete if finished + ended
      if (!session.writable) {
        delete self._sessions[session._sessionId]
        if (myUtils.isEmpty(self._sessions) && self._state === UdpTransport.STATE.CLOSING) {
          self._close(self._onClosingSuccess)
        }
      }
    })
  })
  session.once('finish', function () {
    self._log.debug('session ' + session._sessionId + '/' + session._streamId + ' is no more writable')
    // make sure other listeners are triggered first
    process.nextTick(function () {
      // delete if finished + ended
      if (!session.readable) {
        delete self._sessions[session._sessionId]
        if (myUtils.isEmpty(self._sessions) && self._state === UdpTransport.STATE.CLOSING) {
          self._close(self._onClosingSuccess)
        }
      }
    })
  })
  // done
  this._log.debug('created new session for ' + JSON.stringify(peerAddress))
  return session
}

UdpTransport.prototype._acceptIncomingConnections = function () {
  return this._state === UdpTransport.STATE.LISTENING
}

module.exports = UdpTransport
