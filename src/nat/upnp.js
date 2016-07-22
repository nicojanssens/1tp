'use strict'

var ipAddresses = require('./ip-addresses')
var merge = require('merge')
var natUPnP = require('nat-upnp')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:nat:upnp'
})

var pjson = require('../../package.json')
var defaultDescription = pjson.name + ' v' + pjson.version

var defaultOpts = {}
defaultOpts.public = {}
defaultOpts.private = {}
defaultOpts.ttl = 0
defaultOpts.protocol = 'UDP'
defaultOpts.description = defaultDescription

// returns public IP address of the GW, which is not necessarily your overall public IP address (for instance when GWs are chained)
function getPublicGWAddressP () {
  var deferred = Q.defer()
  getPublicGWAddress(
    function (address) { // on success
      deferred.resolve(address)
    },
    function (error) { // on failure
      deferred.reject(error)
    }
  )
  return deferred.promise
}

function getPublicGWAddress (onSuccess, onFailure) {
  if (onSuccess === undefined || onFailure === undefined) {
    var error = 'get public GW address -- callback handlers are undefined'
    _log.error(error)
    throw new Error(error)
  }
  _log.debug('get public GW address request')
  var client = natUPnP.createClient()
  client.externalIp(function (error, ip) {
    client.close()
    if (error) {
      _log.error('could not determine public GW address. ' + error)
      onFailure(error)
    } else {
      _log.debug('retrieved public GW address ' + ip)
      onSuccess(ip)
    }
  })
}

function mapPublicPortP (args) {
  _log.debug('port mapping request. args = ' + JSON.stringify(args))

  if (!args.public.port) {
    var errorMsg = 'public port is undefined'
    _log.error(errorMsg)
    return Q.fcall(function () {
      throw new Error(errorMsg)
    })
  }

  var pmargs = merge(defaultOpts, args)
  pmargs.private.port = pmargs.private.port || pmargs.public.port
  pmargs.public.host = pmargs.public.host || '*'
  if (!pmargs.private.host) {
    return ipAddresses.getLocalIpAddressP()
      .then(function (address) {
        pmargs.private.host = address
        return _executeMapOperationP(pmargs)
      })
  } else {
    return _executeMapOperationP(pmargs)
  }
}

function mapPublicPort (args, onSuccess, onFailure) {
  if (onSuccess === undefined || onFailure === undefined) {
    var error = 'map private to public port -- callback handlers are undefined'
    _log.error(error)
    throw new Error(error)
  }
  mapPublicPortP(args)
    .then(function (pmargs) {
      onSuccess(pmargs)
    })
    .catch(function (error) {
      onFailure(error)
    })
}

function _executeMapOperationP (pmargs) {
  _log.debug('executing pmapping request with args ' + JSON.stringify(pmargs))
  var deferred = Q.defer()
  var client = natUPnP.createClient()
  client.portMapping(pmargs, function (error) {
    client.close()
    if (error) {
      _log.error('could not map local port ' + pmargs.private.port + ' to public port ' + pmargs.public.port + '. ' + error)
      deferred.reject(error)
    } else {
      deferred.resolve(pmargs)
    }
  })
  return deferred.promise
}

function unmapPublicPortP (args) {
  _log.debug('port un-mapping request. args = ' + JSON.stringify(args))
  var deferred = Q.defer()

  if (!args.public.port) {
    var errorMsg = 'public port is undefined'
    _log.error(errorMsg)
    deferred.reject(new Error(errorMsg))
  } else {
    var client = natUPnP.createClient()
    client.portUnmapping(args, function (error) {
      client.close()
      if (error) {
        _log.error('could not unmap public port ' + args.public.port + '. ' + error)
        deferred.reject(error)
      } else {
        deferred.resolve()
      }
    })
  }

  return deferred.promise
}

function unmapPublicPort (args, onSuccess, onFailure) {
  if (onSuccess === undefined || onFailure === undefined) {
    var error = 'port un-mapping request -- callback handlers are undefined'
    _log.error(error)
    throw new Error(error)
  }
  unmapPublicPortP(args)
    .then(function () {
      onSuccess()
    })
    .catch(function (error) {
      onFailure(error)
    })
}

// return all current port mappings
function getPortMappingsP () {
  var deferred = Q.defer()
  getPortMappings(
    function (mappings) { // on success
      deferred.resolve(mappings)
    },
    function (error) { // on failure
      deferred.reject(error)
    }
  )
  return deferred.promise
}

function getPortMappings (onSuccess, onFailure) {
  if (onSuccess === undefined || onFailure === undefined) {
    var error = 'get port mappings -- callback handlers are undefined'
    _log.error(error)
    throw new Error(error)
  }
  _log.debug('get port mappings')
  var client = natUPnP.createClient()
  client.getMappings(function (error, mappings) {
    client.close()
    if (error) {
      _log.error('could not retrieve port mappings. ' + error)
      onFailure(error)
    } else {
      _log.debug('retrieving port mappings ' + JSON.stringify(mappings))
      onSuccess(mappings)
    }
  })
}

function printPortMappings () {
  getPortMappingsP()
    .then(function (mappings) {
      console.log(mappings)
    })
}

exports.getPublicGWAddressP = getPublicGWAddressP
exports.getPublicGWAddress = getPublicGWAddress
exports.mapPublicPortP = mapPublicPortP
exports.mapPublicPort = mapPublicPort
exports.unmapPublicPortP = unmapPublicPortP
exports.unmapPublicPort = unmapPublicPort
exports.getPortMappingsP = getPortMappingsP
exports.getPortMappings = getPortMappings
exports.printPortMappings = printPortMappings
