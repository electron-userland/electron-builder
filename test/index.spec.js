'use strict';

/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var test             = require( 'ava-tf' );
var tmp              = require( 'tmp' );
var fs               = require( 'fs' );
var proxyquire       = require( 'proxyquire' );
var proxyquireStrict = proxyquire.noCallThru();

test( 'Builder.init', function( t ) {
  t.plan( 2 );

  var Builder = proxyquireStrict(
    'out',
    {
      './platforms' : {}
    }
  );

  t.is( typeof Builder.init, 'function' );
  t.is( typeof Builder.init().build, 'function' );
} );

test.cb( 'Builder.init().build - call the correct platform', function( t ) {
  t.plan( 2 );

  var Builder = proxyquireStrict(
    'out',
    {
      './platforms' : function( platform ) {
        if ( platform === 'bar' ) {
          return {
            init : function() {
              return {
                build : function( options, callback ) {
                  callback( null, 'foo' )
                }
              };
            }
          };
        }
      }
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      platform : 'bar',
      config   : { bar : {} },
      log      : function() {}
    },
    function( error, result ) {
      t.is( error, null );
      t.is( result, 'foo' );
      t.end();
    }
  );
} );

test.cb( 'Builder.init().build - create output directory if not present', function( t ) {
  t.plan( 1 );

  var tmpDir  = tmp.dirSync( { unsafeCleanup : true } );
  var Builder = proxyquireStrict(
    'out',
    {
      './platforms' : function( platform ) {
        if ( platform === 'bar' ) {
          return {
            init : function() {
              return {
                build : function( options, callback ) {
                  callback( null, 'foo' )
                }
              };
            }
          };
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
      out      : tmpDir.name + '/foo',
      log      : function() {}
    },
    function( error, result ) {
      t.is( fs.existsSync( tmpDir.name + '/foo' ), true );

      tmpDir.removeCallback();

      t.end();
    }
  );
} );

test( 'Builder.init().build - check for required options', function( t ) {
  t.plan( 5 );

  var Builder = proxyquireStrict(
    'out',
    {
      './platforms' : {}
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      platform : 'bar',
      config   : 'baz',
      log      : function() {}
    },
    function( error ) {
      t.is( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      platform : 'baz',
      log      : function() {}
    },
    function( error ) {
      t.is( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      basePath : 'bar',
      config   : {},
      log      : function() {}
    },
    function( error ) {
      t.is( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      config   : {},
      basePath : 'foo',
      platform : 'bar',
      log      : function() {}
    },
    function( error ) {
      t.is( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      config   : {},
      basePath : 'bar',
      platform : 'baz',
      log      : function() {}
    },
    function( error ) {
      t.is(
        error.message,
        'No config property found for `baz`.\nPlease check your configuration file and the documentation.'
      );
    }
  );
} );
