'use strict'

var events = require('events')
var inherits = require('inherits')
var ProxyStream = require('./stream')
var Q = require('q')
var util = require('util')
var flunkyUtils = require('./utils')

var debug = require('debug')
var debugLog = debug('1tp:net')
var errorLog = debug('1tp:net:error')

var connectTimeout = 500

// Server class

var Server = function (transports, connectionListener) {
  if (!(this instanceof Server)) {
    return new Server(transports, connectionListener)
  }
  if (transports === undefined) {
    var transportsUndefinedError = 'incorrect server args: transports is undefined'
    errorLog(transportsUndefinedError)
    throw new Error(transportsUndefinedError)
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // register event listeners
  this._registerTransportEvents(this._transports, connectionListener)
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  flunkyUtils.mixinEventEmitterErrorFunction(this, errorLog)
  // register connectionListener -- if this is a function
  if (typeof connectionListener === 'function') {
    this.once('connection', connectionListener)
  }
  // done
  debugLog('created new net stream')
}

// Inherit EventEmitter
util.inherits(Server, events.EventEmitter)

Server.prototype.listen = function () {
  // first optional argument -> connectionInfo
  var activationInfo = arguments[0]
  if (activationInfo === undefined || typeof activationInfo !== 'object') {
    activationInfo = []
  }
  // last optional argument -> callback
  var callback = arguments[arguments.length - 1]
  if (typeof callback === 'function') {
    this.once('listening', callback)
  }
  // create list of promises
  var activationPromises = this._transports.map(function (transport) {
    var transportActivationInfo = activationInfo.find(function (activationInfoInstance) {
      if (activationInfoInstance.transportType === transport.transportType()) {
        return activationInfoInstance
      }
    })
    debugLog('activating transport with connection info ' + JSON.stringify(transportActivationInfo))
    return transport.activateP(transportActivationInfo)
  })
  // execute promises
  var self = this
  Q.all(activationPromises)
    .then(function (listeningInfo) {
      debugLog('collected listening info ' + JSON.stringify(listeningInfo))
      listeningInfo = [].concat.apply([], listeningInfo) // flatten multidimensional array
      self._listeningInfo = listeningInfo
      self.emit('listening')
    })
    .catch(function (error) {
      errorLog(error)
      self._error(error)
    })
}

Server.prototype.address = function () {
  return this._listeningInfo
}

Server.prototype.close = function () {
  throw new Error('server.close not implemented yet')
}

Server.prototype._registerTransportEvents = function (transports) {
  var self = this
  transports.forEach(function (transport) {
    transport.on('connection', self._onIncomingConnection())
    transport.on('error', function (error) {
      errorLog(error)
      self._error(error)
    })
  })
}

Server.prototype._onIncomingConnection = function () {
  var self = this
  return function (stream, transport, peerConnectionInfo) {
    debugLog('new incoming connection for transport ' + transport.transportType(), ', peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
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
  if (transports === undefined) {
    var transportsUndefinedError = 'incorrect socket args: transports is undefined'
    errorLog(transportsUndefinedError)
    throw new Error(transportsUndefinedError)
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // init proxy stream
  ProxyStream.call(this)
  // register _error handler
  flunkyUtils.mixinEventEmitterErrorFunction(this, errorLog)
  // done
  debugLog('created new net socket')
}

inherits(Socket, ProxyStream)

Socket.prototype.connect = function (connectionInfo, connectionListener) {
  // verify if connectionInfo is defined
  if (connectionInfo === undefined) {
    var connectionInfoUndefinedError = 'incorrect args: connectionInfo is undefined'
    errorLog(connectionInfoUndefinedError)
    this._error(connectionInfoUndefinedError)
  }
  // register connectionListener -- if this is a function
  if (typeof connectionListener === 'function') {
    this.once('connect', connectionListener)
  }
  // create array of connection infos
  connectionInfo = Array.isArray(connectionInfo) ? connectionInfo : [connectionInfo]
  // organize connection infos per transport
  var self = this
  var connectionInfoPerTransport = connectionInfo.map(function (endpointInfo) {
    var transport = self._transports.find(function (registeredTransport) {
      if (endpointInfo.transportType === registeredTransport.transportType()) {
        return registeredTransport
      }
    })
    debugLog('preparing to setup connection with ' + JSON.stringify(endpointInfo))
    return {
      transport: transport,
      endpointInfo: endpointInfo
    }
  })
  // create chain of connect promises
  var promiseChain = Q.fcall(function () {
    // start
    return
  })
  var foundStream = false
  connectionInfoPerTransport.forEach(function (transportSpecs) {
    if (!foundStream) {
      promiseChain = promiseChain.then(function (stream) {
        // no stream found, execute a new connect promise
        if (!stream) {
          debugLog('no stream found, executing another connect promise')
          var connectTimeoutPromise = _createConnectTimeoutPromise(transportSpecs)
          return connectTimeoutPromise
        // stream is found, fire event and stop further searching
        } else {
          foundStream = true
          debugLog('found stream -- forwarding to next stage')
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
      debugLog(noConnectionError)
      self._error(noConnectionError)
    // stream is found -- shout it out loud
    } else {
      debugLog('w00t ... connection established')
      self.connectStream(stream)
      self.remoteAddress = [stream._peerConnectionInfo]
      self.emit('connect')
    }
  }).catch(function (error) {
    errorLog(error)
    self._error(error)
  })
}

Socket.prototype.isConnected = function () {
  return (this._connectedStream !== undefined)
}

Socket.prototype.destroy = function () {
  var errorMsg = 'socket.destroy function not yet implemented'
  errorLog(errorMsg)
  this._error(errorMsg)
}

Socket.prototype.end = function () {
  var errorMsg = 'socket.end function not yet implemented'
  errorLog(errorMsg)
  this._error(errorMsg)
}

// factory functions

var createServer = function (transports, connectionListener) {
  return new Server(transports, connectionListener)
}

var createConnection = function (transports, connectionInfo, connectionListener) {
  var socket = new Socket(transports)
  socket.connect(connectionInfo, connectionListener)
  return socket
}

var _createConnectTimeoutPromise = function (transportSpecs) {
  // create connect promise
  var transport = transportSpecs.transport
  var endpointInfo = transportSpecs.endpointInfo
  var connectPromise = transport.connectP(endpointInfo)
  // resolve promise without result if it does not complete before timeout
  var connectTimeoutPromise = flunkyUtils.timeoutResolvePromise(connectPromise, connectTimeout, function () {
    // on timeout, close connection
    var timeoutMessage = 'timeout while transport ' + transport.transportType() + ' tries to connect with ' + JSON.stringify(endpointInfo)
    debugLog(timeoutMessage)
  // TODO: close transport
  })
  return connectTimeoutPromise
}

module.exports = {
  createConnection: createConnection,
  createServer: createServer,
  connect: createConnection,
  Server: Server,
  Socket: Socket
}
