'use strict';

/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var test             = require( 'tape' );
var tmp              = require( 'tmp' );
var fs               = require( 'fs' );
var proxyquire       = require( 'proxyquire' );
var proxyquireStrict = proxyquire.noCallThru();

test( 'Builder.init', function( t ) {
  t.plan( 2 );

  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {}
    }
  );

  t.equal( typeof Builder.init, 'function' );
  t.equal( typeof Builder.init().build, 'function' );
} );

test( 'Builder.init().build - call the correct platform', function( t ) {
  t.plan( 2 );

  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {
        bar : {
          init : function() {
            return {
              build : function( options, callback ) {
                callback( null, 'foo' )
              }
            }
          }
        }
      }
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      platform : 'bar',
      config   : {}
    },
    function( error, result ) {
      console.log( error );
      t.equal( error, null );
      t.equal( result, 'foo' );
      t.end();
    }
  );
} );

test( 'Builder.init().build - create output directory if not present', function( t ) {
  t.plan( 1 );

  var tmpDir  = tmp.dirSync( { unsafeCleanup : true } );
  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {
        bar : {
          init : function() {
            return {
              build : function( options, callback ) {
                callback( null, 'foo' )
              }
            }
          }
        }
      }
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      platform : 'baz',
      config   : {},
      out      : tmpDir.name + '/foo'
    },
    function( error, result ) {
      t.equal( fs.existsSync( tmpDir.name + '/foo' ), true );

      tmpDir.removeCallback();

      t.end();
    }
  );
} );

test( 'Builder.init().build - check for required options', function( t ) {
  t.plan( 4 );

  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {}
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      platform : 'bar',
      config   : 'baz'
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      platform : 'baz',
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      config   : {}
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      config   : {},
      basePath : 'foo',
      platform : 'bar'
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );
} );
