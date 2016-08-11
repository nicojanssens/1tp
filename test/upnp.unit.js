'use strict'

var ipAddresses = require('../lib/nat/ip-addresses')
var upnp = require('../lib/nat/upnp')
var yn = require('yn')

var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var assert = chai.assert
var expect = chai.expect
chai.use(chaiAsPromised)
chai.should()

var myPublicIpAddress
var executeUpnpTests = yn(process.env.EXECUTE_UPNP_TESTS)

if (executeUpnpTests) {
  describe('#NAT-UPNP', function () {
    this.timeout(10000)

    before(function (done) {
      ipAddresses.getPublicIpAddressP()
        .then(function (ip) {
          myPublicIpAddress = ip
          done()
        })
        .catch(function (error) {
          assert(false, 'Could not retrieve public address before running tests. ' + error)
        })
    })

    it('should return my public ip address', function () {
      return upnp.getPublicGWAddressP().should.eventually.equal(myPublicIpAddress)
    })

    it('should map UDP port 65532 to 65532 and delete it afterwards', function () {
      var pmargs = {}
      pmargs.public = {}
      pmargs.public.port = 65532
      var myMapping
      return upnp.mapPublicPortP(pmargs)
        .then(function (args) {
          myMapping = args
          return upnp.getPortMappingsP()
        })
        .then(function (currentMappings) {
          expect(_pmMatch(myMapping, currentMappings)).to.be.true
          return upnp.unmapPublicPortP(myMapping)
        })
        .then(function () {
          return upnp.getPortMappingsP()
        })
        .then(function (currentMappings) {
          expect(_pmMatch(myMapping, currentMappings)).to.be.false
        })
    })

    it('should map TCP port 65534 to 65533, using custom description and ttl = 2 minutes, and delete it afterwards', function () {
      var pmargs = {}
      pmargs.public = {}
      pmargs.private = {}
      pmargs.private.port = 65534
      pmargs.public.port = 65533
      pmargs.protocol = 'TCP'
      pmargs.ttl = 120
      pmargs.description = 'funky:test'
      var myMapping
      return upnp.mapPublicPortP(pmargs)
        .then(function (args) {
          myMapping = args
          return upnp.getPortMappingsP()
        })
        .then(function (currentMappings) {
          expect(_pmMatch(myMapping, currentMappings)).to.be.true
          return upnp.unmapPublicPortP(myMapping)
        })
        .then(function () {
          return upnp.getPortMappingsP()
        })
        .then(function (currentMappings) {
          expect(_pmMatch(myMapping, currentMappings)).to.be.false
        })
    })
  })
}

function _pmMatch (myMapping, returnedMappings) {
  var match = false
  returnedMappings.forEach(function (returnedMapping) {
    if (
      returnedMapping.public.port === myMapping.public.port &&
      returnedMapping.public.host === myMapping.public.host &&
      returnedMapping.private.port === myMapping.private.port &&
      returnedMapping.private.host === myMapping.private.host &&
      returnedMapping.ttl === myMapping.ttl &&
      returnedMapping.protocol.toLowerCase() === myMapping.protocol.toLowerCase() &&
      returnedMapping.description === myMapping.description
    ) {
      match = true
    }
  })
  return match
}
