/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var test             = require( 'tape' );
var fs               = require( 'fs' );
var proxyquire       = require( 'proxyquire' );
var proxyquireStrict = proxyquire.noCallThru();

var testConfig = {
  appPath  : 'ha/za/za',
  basePath : '/foo/bar',
  config   : {
    osx : {
      background : '../boooom.png',
      icon       : '/foo/icon.icns',
      contents   : [
        {},
        {}
      ],
      title : 'Example App',
    }
  },
  log : function() {},
  out : '/somewhere/out/there'
};


test( 'OSXBilder.builder - write a proper config file', function( t ) {
  var osx = proxyquireStrict(
    './osx',
    {
      appdmg : function( options ) {
        t.equal( options.target, '/somewhere/out/there/Example App.dmg' );

        var configFilePath = options.source;
        var config         = require( configFilePath, 'utf8' );

        t.equal( config.background, '/foo/boooom.png' );
        t.equal( config.icon, '/foo/icon.icns' );
        t.equal( config.contents[ 1 ].path, 'ha/za/za' );
        t.equal( config.title, 'Example App' );

        t.end();

        return {
          on : function() {}
        };
      }
    }
  );

  osx.init().build( testConfig );
} );

test( 'OSXBilder.builder - call success callback', function( t ) {
  var osx = proxyquireStrict(
    './osx',
    {
      appdmg : function( options ) {
        return {
          on : function( event, callback ) {
            if ( event === 'finish' ) {
              callback();
            }
          }
        };
      }
    }
  );

  osx.init().build( testConfig, function( error ) {
    t.notOk( error, 'Throw no error' );

    t.end();
  } );
} );

test( 'OSXBilder.builder - call error callback', function( t ) {
  var osx = proxyquireStrict(
    './osx',
    {
      appdmg : function( options ) {
        return {
          on : function( event, callback ) {
            if ( event === 'error' ) {
              callback( 'error' );
            }
          }
        };
      }
    }
  );

  osx.init().build( testConfig, function( error ) {
    t.equal( error, 'error' );

    t.end();
  } );
} );
