/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var test                = require( 'tape' );
var proxyquire          = require( 'proxyquire' );
var proxyquireStrict    = proxyquire.noCallThru();

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
  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {
        bar : {
          init : function() {
            return {
              build : function( options, callback ) {
                t.end();
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
      platform : 'bar',
      config   : {}
    },
    function() {}
  );
} );

test( 'Builder.init().build - load config if passed as string', function( t ) {
  t.plan( 3 );

  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {
        bar : {
          init : function() {
            return {
              build : function( options, callback ) {
                t.equal( options.basePath, '/some' );
                t.equal( options.config.foo, 'bar' );
              }
            }
          }
        }
      },
      '/some/config.json' : {
        foo : 'bar'
      }
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      platform : 'bar',
      config   : '/some/config.json'
    },
    function( e ) {}
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      platform : 'bar',
      config   : '/some/not/existant/config.json'
    },
    function( error ) {
      t.equal( error.message, 'Could not load config file' );
    }
  );
} );

test( 'Builder.init().build - check for required options', function( t ) {
  t.plan( 3 );

  var Builder = proxyquireStrict(
    '../',
    {
      './lib/platforms' : {}
    }
  );

  Builder.init().build(
    {
      platform : 'foo',
      config   : 'bar'
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'foo',
      config   : 'bar'
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );

  Builder.init().build(
    {
      appPath  : 'bar',
      platform : 'foo'
    },
    function( error ) {
      t.equal( error.message, 'Required option not set' );
    }
  );
} );

