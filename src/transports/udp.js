'use strict'

var AbstractTransport = require('./abstract')
var dgram = require('dgram')
var ipAddresses = require('../nat/ip-addresses')
var merge = require('merge')
var myUtils = require('../utils')
var UdpStream = require('./streams/udp')
var util = require('util')

var debug = require('debug')
var debugLog = debug('1tp:transports:udp')
var errorLog = debug('1tp:transports:udp:error')

// feature toggle -- for dev purposes only
var _connectOnReply = true

/**
 * Udp transport
 *
 * @constructor
 * @fires UdpTransport#listening
 * @fires UdpTransport#connection
 * @fires UdpTransport#connect
 * @fires UdpTransport#error
 */
function UdpTransport (dgramOpts) {
  if (!(this instanceof UdpTransport)) {
    return new UdpTransport(dgramOpts)
  }
  AbstractTransport.call(this)
  // create and configure dgram socket
  var opts = merge(Object.create(UdpTransport.DEFAULTS), dgramOpts)
  this._createDgramSocket(opts)
  // keep track of udp streams
  this._streams = {}
  // accept new incoming connections
  this._acceptIncomingConnections = true
  // done
  debugLog('created udp transport with args ' + JSON.stringify(opts))
}

// Inherit from abstract transport
util.inherits(UdpTransport, AbstractTransport)

UdpTransport.DEFAULTS = {
  type: 'udp4',
  reuseAddr: false
}

UdpTransport.prototype.transportType = function () {
  return 'udp'
}

UdpTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  var port, address
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
    port = listeningInfo.transportInfo.port
    address = listeningInfo.transportInfo.address
  }
  var self = this
  // fire up
  this._socket.bind(port, address, function () {
    debugLog('listening on address:' + address + ', port:' + port)
    // create connection info
    var myConnectionInfo = {
      transportType: self.transportType(),
      transportInfo: {
        // address will be added below
        port: self._socket.address().port
      }
    }
    // if address was specified in listening info, then reuse it
    if (address) {
      myConnectionInfo.transportInfo.address = self._socket.address().address
      self._myConnectionInfo = myConnectionInfo
      self._fireListeningEvent(myConnectionInfo, onSuccess)
    } else {
      // otherwise, retrieve local ip address
      var myConnectionInfos = ipAddresses.getAllLocalIpv4Addresses().map(function (localAddress) {
        var connectionInfo = {
          transportType: myConnectionInfo.transportType,
          transportInfo: {
            address: localAddress,
            // INVARIANT thomasdelaet: port numbers must be the same when creating separate transport info instances for different local ipAddresses
            port: myConnectionInfo.transportInfo.port
          }
        }
        return connectionInfo
      })
      self._fireListeningEvent(myConnectionInfos, onSuccess)
    }
  })
}

UdpTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  debugLog('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- Ignoring request'
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
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    errorLog(addressError)
    this._error(addressError, onFailure)
    return
  }
  // create new stream if rinfo is unknown
  var stream = this._createUdpStream(peerConnectionInfo.transportInfo, null)
  if (!_connectOnReply) {
    this._fireConnectEvent(stream, peerConnectionInfo, onSuccess)
  } else {
    // store callbacks for later use
    // TODO: assign these values to the associate 'stream'
    this._connectOnSuccess = onSuccess
    this._connectOnFailure = onFailure
    this._peerConnectionInfo = peerConnectionInfo
    // init session
    debugLog('send SYN packet for udp session ' + stream._sessionId)
    stream._sendSignalingMessage(UdpStream.PACKET.SYN)
  }
}

UdpTransport.prototype.close = function (onSuccess, onFailure) {
  this._acceptIncomingConnections = false
  if (myUtils.isEmpty(this._streams)) {
    onSuccess()
    return
  }
}

// UdpTransport.prototype.close = function (onSuccess, onFailure) {
//   var self = this
//   this._socket.close(function () {
//     self._fireCloseEvent(onSuccess)
//   })
// }

UdpTransport.prototype._createDgramSocket = function (dgramOpts) {
  this._socket = dgram.createSocket(dgramOpts)
  this._socket.on('message', this._onMessage())
  this._socket.on('close', function () {
    debugLog('udp socket closed')
  // TODO
  })
  var self = this
  this._socket.on('error', function (error) {
    errorLog(error)
    self._error(error)
  // TODO
  })
}

UdpTransport.prototype._onMessage = function () {
  var self = this
  return function (bytes, rinfo) {
    var message = _parse(bytes)
    var peerAddress = {
      address: rinfo.address,
      port: rinfo.port
    }
    // create new stream if rinfo is unknown
    var stream = self._createUdpStream(peerAddress, message.sessionId)
    if (stream) {
      // and notify all listeners
      var peerConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: peerAddress
      }
      self._fireConnectionEvent(stream, self, peerConnectionInfo)
    }
    // process incoming dgram
    self._processIncomingDgram(message)
  }
}

UdpTransport.prototype._processIncomingDgram = function (message) {
  switch (message.type) {
    case UdpStream.PACKET.SYN:
      debugLog('incoming SYN packet')
      // if transport is not close -- i.e. it accepts incoming connections
      if (this._acceptIncomingConnections) {
        // send syn-ack
        var stream = this._streams[message.sessionId]
        debugLog('send SYN ACK for udp session ' + stream._sessionId)
        stream._sendSignalingMessage(UdpStream.PACKET.SYN_ACK)
      } else {
        debugLog('not accepting new connections -- dropping SYN on the floor')
      }
      // done
      break
    case UdpStream.PACKET.SYN_ACK:
      debugLog('incoming SYN-ACK packet')
      // fire connect event
      var stream = this._streams[message.sessionId]
      var peerConnectionInfo = this._peerConnectionInfo
      var onSuccess = this._connectOnSuccess
      this._fireConnectEvent(stream, peerConnectionInfo, onSuccess)
      // done
      break
    case UdpStream.PACKET.DATA:
      debugLog('incoming DATA packet')
      // write message to stream
      this._streams[message.sessionId].push(message.data)
      // done
      break
    case UdpStream.PACKET.FIN:
      debugLog('incoming FIN packet')
      // send end of the stream (EOF)
      this._streams[message.sessionId].push(null)
      // deregister stream
      delete this._streams[message.sessionId]
      // done
      break
    case UdpStream.PACKET.RST:
      debugLog('incoming RST packet')
      // destroy stream
      this._streams[message.sessionId]._destroy()
      // deregister stream
      delete this._streams[message.sessionId]
      // done
      break
    default:
      var errorMsg = "don't know how to process message type " + message.type + ' -- dropping message on the floor'
      errorLog(errorMsg)
      this._error(errorMsg)
  }
}

UdpTransport.prototype._createUdpStream = function (peerAddress, streamId) {
  var streamAlreadyExists = (streamId !== null && (streamId in this._streams))
  var blockIncomingConnections = (streamId !== null && !this._acceptIncomingConnections)
  if (streamAlreadyExists || blockIncomingConnections) {
    return
  }
  // create new UpdStream
  var stream = new UdpStream(peerAddress, streamId, this._socket)
  this._streams[stream._sessionId] = stream
  debug('created new stream for ' + JSON.stringify(peerAddress))
  return stream
}

function _parse (bytes) {
  var sessionId = bytes.slice(0, 8).toString()
  var type = bytes.slice(8, 10).readUInt16BE()
  var data = bytes.slice(10, bytes.length)
  return {
    sessionId: sessionId,
    type: type,
    data: data
  }
}

module.exports = UdpTransport
