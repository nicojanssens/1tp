'use strict'

var AbstractTransport = require('./abstract')
var dgram = require('dgram')
var merge = require('merge')
var myUtils = require('../utils')
var nicAddresses = require('./addresses/nic')
var runtime = require('mm-runtime-info')
var signalingFactory = require('../signaling/in-band/factory')
var UdpSession = require('./streams/udp')
var util = require('util')
var winston = require('winston')
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
function UdpTransport (dgramOpts) {
  if (!(this instanceof UdpTransport)) {
    return new UdpTransport(dgramOpts)
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
  this._opts = merge(Object.create(UdpTransport.DEFAULTS), dgramOpts)
  this._createNewDgramSocket()
  // keep track of udp sessions
  this._sessions = {}
  // done
  this._log.debug('created udp transport with args ' + JSON.stringify(this._opts))
}

// Inherit from abstract transport
util.inherits(UdpTransport, AbstractTransport)

UdpTransport.DEFAULTS = {
  type: 'udp4',
  reuseAddr: false
}

UdpTransport.STATE = {
  UNBOUND: 0,
  BOUND: 1,
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
  return 500
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
    self._state = UdpTransport.STATE.BOUND
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
  // create new session and init handshake
  var session = this._createUdpSession(peerConnectionInfo.transportInfo, null)
  // and init handshake
  var self = this
  session.initHandshakeP()
    .then(function () {
      self._fireConnectEvent(session, peerConnectionInfo, onSuccess)
    })
    .catch(function (error) {
      delete self._sessions[session._sessionId]
      self._error(error, onFailure)
    })
}

UdpTransport.prototype.close = function (onSuccess, onFailure) {
  if (myUtils.isEmpty(this._sessions)) {
    this._state = UdpTransport.STATE.CLOSED
    this._fireCloseEvent(onSuccess)
    return
  }
  this._state = UdpTransport.STATE.CLOSING
  this._onClosed = onSuccess
}

UdpTransport.prototype._createNewDgramSocket = function () {
  this._socket = dgram.createSocket(this._opts)
  this._state = UdpTransport.STATE.UNBOUND
  this._muteSocketErrorListeners = false
  this._socket.on('message', this._onIncomingBytes())
  this._socket.on('close', function () {
    self._log.debug('udp socket closed')
  // TODO
  })
  var self = this
  this._socket.on('error', function (error) {
    if (self._muteSocketErrorListeners) {
      return
    }
    self._log.error(error)
    self._error(error)
  })
}

UdpTransport.prototype._onIncomingBytes = function () {
  var self = this
  return function (bytes, rinfo) {
    self._log.debug('incoming bytes ' + JSON.stringify(bytes) + ' from ' + JSON.stringify(rinfo))
    var message = signalingFactory.parse(bytes)
    // drop requests with no version info
    if (message.version === undefined) {
      var undefinedVersionError = 'incorrect signaling message: undefined version -- ignoring request'
      self._log.error(undefinedVersionError)
      self._error(undefinedVersionError)
      return
    }
    // drop SYN requests when this transport is closed -- i.e. it doesn't accepts incoming connections
    if (message.type === signalingFactory.MESSAGE.SYN && !self._acceptIncomingConnections()) {
      var notAcceptingNewConnectionsError = 'not accepting new connections -- ignoring request'
      self._log.debug(notAcceptingNewConnectionsError)
      return
    }
    // create new udp session object when SYN request and transport is not closed
    if (message.type === signalingFactory.MESSAGE.SYN && self._acceptIncomingConnections()) {
      var peerAddress = {
        address: rinfo.address,
        port: rinfo.port
      }
      // create new udp session
      var session = self._createUdpSession(peerAddress, message.sessionId)
      if (!session) {
        // or obtain the existing session
        session = self._sessions[message.sessionId]
      }
      // and notify all listeners once this session is ready to use
      var peerConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: peerAddress
      }
      session.once('connected', function () {
        self._fireConnectionEvent(session, self, peerConnectionInfo)
      })
    }
    // get session
    var thisSession = self._sessions[message.sessionId]
    // drop message if session is undefined
    if (!thisSession) {
      var sessionNotFoundError = 'could not find UDP session for session ' + message.sessionId + ' -- ignoring request'
      self._log.debug(sessionNotFoundError)
      return
    }
    // process valid message
    thisSession.processMessage(message)
  }
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
  var session = new UdpSession(peerAddress, sessionId, this._socket)
  // store session
  this._sessions[session._sessionId] = session
  // register handlers for closing events
  var self = this
  session.once('close', function () {
    delete self._sessions[session._sessionId]
    if (myUtils.isEmpty(self._sessions)) {
      self._state = UdpTransport.STATE.CLOSED
      self._fireCloseEvent(self._onClosed)
    }
  })
  session.once('end', function () {
    // delete if finished + ended
    if (self.finished) {
      delete self._sessions[session._sessionId]
      if (myUtils.isEmpty(self._sessions)) {
        self._state = UdpTransport.STATE.CLOSED
        self._fireCloseEvent(self._onClosed)
      }
    }
  })
  session.once('finish', function () {
    // delete if finished + ended
    if (self.ended) {
      delete self._sessions[session._sessionId]
      if (myUtils.isEmpty(self._sessions)) {
        self._state = UdpTransport.STATE.CLOSED
        self._fireCloseEvent(self._onClosed)
      }
    }
  })
  // done
  this._log.debug('created new session for ' + JSON.stringify(peerAddress))
  return session
}

UdpTransport.prototype._acceptIncomingConnections = function () {
  return this._state === UdpTransport.STATE.BOUND
}

module.exports = UdpTransport
