'use strict'

var config = require('./config')
var events = require('events')
var inherits = require('util').inherits
var myUtils = require('./utils')
var ProxyStream = require('./stream')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var onetpTransports = require('./transports')
var TcpTransport = onetpTransports.tcp
var TurnTransport = onetpTransports.turn
var UdpTransport = onetpTransports.udp
var WebSocketSignaling = require('./signaling').websocket

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:net'
})

// Server class

var Server = function () {
  if (!(this instanceof Server)) {
    return new Server()
  }
  // logging
  this.setLogger(winston)
  // first optional argument -> transports
  var transports = arguments[0]
  if (transports === undefined || typeof transports !== 'object') {
    this._log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = arguments[arguments.length - 1]
  // register connectionListener -- if this is a function
  if (typeof connectionListener === 'function') {
    this.once('connection', connectionListener)
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // register event listeners
  this._registerTransportEvents(this._transports, connectionListener)
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new net stream')
}

// Inherit EventEmitter
inherits(Server, events.EventEmitter)

Server.prototype.setLogger = function (logger) {
  this._log = winstonWrapper(logger)
  this._log.addMeta({
    module: '1tp:net:server'
  })
}

Server.prototype.listen = function () {
  // first optional argument -> listeningInfo
  var listeningInfo = arguments[0]
  if (listeningInfo === undefined || typeof listeningInfo !== 'object') {
    listeningInfo = []
  }
  // last optional argument -> callback
  var callback = arguments[arguments.length - 1]
  if (typeof callback === 'function') {
    this.once('listening', callback)
  }
  var self = this
  this.listenP(listeningInfo)
    .then(function (collectedListeningInfo) {
      self.emit('listening')
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

Server.prototype.listenP = function (listeningInfo) {
  // check listening info
  if (listeningInfo === undefined || typeof listeningInfo !== 'object') {
    listeningInfo = []
  }
  var self = this
  // create list of promises
  var listenPromises = this._transports.map(function (transport) {
    var transportListeningInfo = listeningInfo.find(function (listeningInfoInstance) {
      if (listeningInfoInstance.transportType === transport.transportType()) {
        return listeningInfoInstance
      }
    })
    self._log.debug('binding transport with listening info ' + JSON.stringify(transportListeningInfo))
    return transport.listenP(transportListeningInfo)
  })
  // execute promises
  return Q.all(listenPromises)
    .then(function (collectedListeningInfo) {
      self._log.debug('collected listening info ' + JSON.stringify(collectedListeningInfo))
      collectedListeningInfo = [].concat.apply([], collectedListeningInfo) // flatten multidimensional array
      self._listeningInfo = collectedListeningInfo
      return collectedListeningInfo
    })
}

Server.prototype.address = function () {
  return this._listeningInfo
}

Server.prototype.close = function () {
  this.transports.forEach(function (transport) {
    transport.blockIncomingConnections()
  })
}

Server.prototype._registerTransportEvents = function (transports) {
  var self = this
  transports.forEach(function (transport) {
    transport.on('connection', self._onIncomingConnection())
    transport.on('error', function (error) {
      self._log.error(error)
      self._error(error)
    })
  })
}

Server.prototype._onIncomingConnection = function () {
  var self = this
  return function (stream, transport, peerConnectionInfo) {
    self._log.debug('new incoming connection for transport ' + transport.transportType(), ', peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
    /* TODO
     * for now, we only support one single transport connection per session
     * multiple transports will be added later on
     */
    var socket = new Socket(transport)
    socket.connectStream(stream)
    socket.remoteAddress = [peerConnectionInfo]

    self.emit('connection', socket)
  }
}

// Socket class

var Socket = function (transports) {
  if (!(this instanceof Socket)) {
    return new Socket(transports)
  }
  // logging
  this.setLogger(winston)
  // verify transports
  if (transports === undefined) {
    this._log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // init proxy stream
  ProxyStream.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new net socket')
}

inherits(Socket, ProxyStream)

Socket.prototype.setLogger = function (logger) {
  this._log = winstonWrapper(logger)
  this._log.addMeta({
    module: '1tp:net:socket'
  })
}

Socket.prototype.connect = function (connectionInfo, connectListener) {
  // verify if connectionInfo is defined
  if (connectionInfo === undefined) {
    var connectionInfoUndefinedError = 'incorrect args: connectionInfo is undefined'
    this._log.error(connectionInfoUndefinedError)
    this._error(connectionInfoUndefinedError)
  }
  // register connectionListener -- if this is a function
  if (typeof connectListener === 'function') {
    this.once('connect', connectListener)
  }
  // create array of connection infos
  connectionInfo = Array.isArray(connectionInfo) ? connectionInfo : [connectionInfo]
  // prepare connection attempts
  var self = this
  var connectionAttempts = []
  connectionInfo.forEach(function (endpointInfo) {
    var transport = self._transports.find(function (registeredTransport) {
      if (endpointInfo.transportType === registeredTransport.transportType()) {
        return registeredTransport
      }
    })
    if (!transport) {
      self._log.debug('could not find associated transport for connection info ' + JSON.stringify(endpointInfo))
      return
    }
    self._log.debug('preparing to connection attempt with ' + JSON.stringify(endpointInfo))
    connectionAttempts.push({
      transport: transport,
      endpointInfo: endpointInfo
    })
  })
  // create chain of connect promises
  var promiseChain = Q.fcall(function () {
    // start
    return
  })
  var foundStream = false
  connectionAttempts.forEach(function (transportSpecs) {
    if (!foundStream) {
      promiseChain = promiseChain.then(function (stream) {
        // no stream found, execute a new connect promise
        if (!stream) {
          self._log.debug('no stream found, executing another connect promise')
          var connectTimeoutPromise = _createConnectTimeoutPromise(transportSpecs)
          return connectTimeoutPromise
        // stream is found, fire event and stop further searching
        } else {
          foundStream = true
          self._log.debug('found stream -- forwarding to next stage')
          return Q.fcall(function () {
            return stream
          })
        }
      })
    }
  })
  // execute promise chain
  promiseChain.then(function (stream) {
    // no stream found -- the end
    if (!stream) {
      var noConnectionError = 'could not establish connection with ' + JSON.stringify(connectionInfo)
      self._log.debug(noConnectionError)
      self._error(noConnectionError)
    // stream is found -- shout it out loud
    } else {
      self._log.debug('w00t ... connection established')
      self.connectStream(stream)
      self.remoteAddress = [stream._peerConnectionInfo]
      self.emit('connect')
    }
  }).catch(function (error) {
    self._log.error(error)
    self._error(error)
  })
}

Socket.prototype.isConnected = function () {
  return (this._connectedStream !== undefined)
}

Socket.prototype.destroy = function () {
  var errorMsg = 'socket.destroy function not yet implemented'
  this._log.error(errorMsg)
  // this._error(errorMsg)
  this.emit('close')
}

Socket.prototype.end = function () {
  var errorMsg = 'socket.end function not yet implemented'
  this._log.error(errorMsg)
  this._error(errorMsg)
}

// factory functions

var createServer = function () {
  // first optional argument -> transports
  var transports = arguments[0]
  if (transports === undefined || typeof transports !== 'object') {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = arguments[arguments.length - 1]
  // create new server instance
  return new Server(transports, connectionListener)
}

var createConnection = function () {
  // mandator argument -> connectionInfo
  var connectionInfo = arguments[0]
  if (connectionInfo === undefined || typeof connectionInfo !== 'object') {
    _log.error('connectionInfo undefined')
    return
  }
  // first optional argument -> transports
  var transports = arguments[1]
  if (transports === undefined || typeof transports !== 'object') {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectListener = arguments[arguments.length - 1]
  // create socket and init connection handshake
  var socket = new Socket(transports)
  socket.connect(connectionInfo, connectListener)
  // done
  return socket
}

var _createConnectTimeoutPromise = function (transportSpecs) {
  // create connect promise
  var transport = transportSpecs.transport
  var endpointInfo = transportSpecs.endpointInfo
  var connectPromise = transport.connectP(endpointInfo)
  // resolve promise without result if it does not complete before timeout
  var connectTimeoutPromise = myUtils.timeoutResolvePromise(connectPromise, transport.connectTimeout(), function () {
    // on timeout, close connection
    var timeoutMessage = 'timeout while transport ' + transport.transportType() + ' tries to connect with ' + JSON.stringify(endpointInfo)
    _log.debug(timeoutMessage)
  // TODO: close transport
  })
  return connectTimeoutPromise
}

var _getDefaultTransports = function () {
  var transports = []
  transports.push(new UdpTransport())
  transports.push(new TcpTransport())
  if (config.turnAddr !== undefined &
    config.turnPort !== undefined &
    config.onetpRegistrar !== undefined
  ) {
    transports.push(new TurnTransport({
      turnServer: config.turnAddr,
      turnPort: config.turnPort,
      turnUsername: config.turnUser,
      turnPassword: config.turnPass,
      signaling: new WebSocketSignaling({
        url: config.onetpRegistrar
      })
    }))
  }
  return transports
}

module.exports = {
  createConnection: createConnection,
  createServer: createServer,
  connect: createConnection,
  Server: Server,
  Socket: Socket
}
