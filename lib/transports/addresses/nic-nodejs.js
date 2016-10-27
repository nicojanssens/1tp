'use strict'

var os = require('os')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:transports:addresses:nic:nodejs'
})

_log.debug('using nic-nodejs')

// returns all available IPv4 NIC addresses -- using callback to be complaint with chrome and cordova replacements
function getIpAddresses (onSuccess, onFailure) {
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
  // return addresses
  _log.debug('retrieved nic IP addresses ' + JSON.stringify(addresses))
  onSuccess(addresses)
}

function getIpAddressesP () {
  var deferred = Q.defer()
  getIpAddresses(
    function (addresses) {
      _log.debug('found nic IP addresses ' + JSON.stringify(addresses))
      deferred.resolve(addresses)
    },
    function (error) {
      _log.error('could not find nic IP: ' + error)
      deferred.reject(error)
    }
  )
  return deferred.promise
}

exports.getIpAddresses = getIpAddresses
exports.getIpAddressesP = getIpAddressesP
