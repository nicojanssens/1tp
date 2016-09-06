'use strict'

var ip = require('ip')

function getAllLocalIpv4AddressesNode (onSuccess) {
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
  //return addresses
  onSuccess(addresses)
}

function getAllLocalIpv4AddressesChrome (onSuccess) {
  var addresses = []
  chrome.system.network.getNetworkInterfaces(function (ifaces) {
    ifaces.forEach(function (iface) {
      var address = iface.address
      if (!ip.isV4Format(address)) {
        // skip over non-ipv4 addresses
        return
      }
      addresses.push(address)
    })
    onSuccess(addresses)
  })
}

function getAllLocalIpv4AddressesCordova (onSuccess, onFailure) {
  var addresses = []
  networkinterface.getIPAddress(
    function (address) {
      if (!ip.isV4Format(address)) {
        // skip over non-ipv4 addresses
        return
      }
      addresses.push(address)
      onSuccess(addresses)
    }
  )
}

module.exports.getAllLocalIpv4AddressesNode = getAllLocalIpv4AddressesNode
module.exports.getAllLocalIpv4AddressesChrome = getAllLocalIpv4AddressesChrome
module.exports.getAllLocalIpv4AddressesCordova = getAllLocalIpv4AddressesCordova
