'use strict'

var debug = require('debug')
var debugLog = debug('1tp:nat:ip-addresses')
var errorLog = debug('1tp:nat:ip-addresses:error')
var publicIp = require('public-ip')
var net = require('net')
var os = require('os')
var Q = require('q')

function getLocalIpAddress (onSuccess, onFailure) {
  var socket = net.createConnection(80, 'www.google.com')
  socket.on('connect', function () {
    onSuccess(socket.address().address)
    socket.end()
  })
  socket.on('error', function (error) {
    onFailure(error)
  })
}

function getLocalIpAddressP () {
  var deferred = Q.defer()
  getLocalIpAddress(
    function (address) {
      debugLog('found private active IP network address ' + address)
      deferred.resolve(address)
    },
    function (error) {
      errorLog('could not find private active IP network address.' + error)
      deferred.reject(error)
    }
  )
  return deferred.promise
}

// returns node's public IP address -- i.e. address visible beyond the latest GW
function getPublicIpAddressP () {
  debugLog('get public IP address request')
  var deferred = Q.defer()
  publicIp(function (error, ip) {
    if (error) {
      errorLog('could not determine public IP address. ' + error)
      deferred.reject(error)
    } else {
      debugLog('retrieved public IP address ' + ip)
      deferred.resolve(ip)
    }
  })
  return deferred.promise
}

function getPublicIpAddress (onSuccess, onFailure) {
  getPublicIpAddressP()
    .then(function (address) {
      return onSuccess(address)
    })
    .catch(function (error) {
      return onFailure(error)
    })
}

// returns all available IPv4 NIC addresses
function getAllLocalIpv4Addresses () {
  var ifaces = os.networkInterfaces()
  var addresses = []
  for (var ifname in ifaces) {
    ifaces[ifname].forEach(function (iface) {
      if (iface.family !== 'IPv4' || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return
      }
      addresses.push(iface.address)
    })
  }
  return addresses
}

exports.getLocalIpAddress = getLocalIpAddress
exports.getLocalIpAddressP = getLocalIpAddressP
exports.getPublicIpAddress = getPublicIpAddress
exports.getPublicIpAddressP = getPublicIpAddressP
exports.getAllLocalIpv4Addresses = getAllLocalIpv4Addresses
