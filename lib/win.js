/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var childProcess    = require( 'child_process' );
var os              = require( 'os' );
var writeConfigFile = require( './helper/writeConfigFile' );
var path            = require( 'path' );
var fs              = require( 'fs-extra' );

/**
 * [WinBuilder description]
 * @type {Object}
 */
var WinBuilder = {
  /**
   * [build description]
   * @return {[type]} [description]
   */
  build : function( options, callback ) {
    options.log( 'Starting build for ´' + options.platform + '´' );

    var configFilePath = writeConfigFile( 'installer.nsi', {
      appPath   : _windowsify( path.join( process.cwd(), options.appPath ) ),
      name      : options.name,
      out       : _windowsify( options.out )
    } );

    _copyAssetsToTmpFolder();

    var makensis = childProcess.spawn(
      'makensis',
      [ configFilePath ],
      {
        env   : process.env
      }
    );

    makensis.stdout.on( 'data', function ( data ) {
      options.log( 'makensis: ' + data );
    } );

    makensis.stderr.on( 'data', function ( data ) {
      options.log('makensis error: ' + data);
    });

    makensis.on( 'close', function ( code ) {
      options.log( 'Finished makensis with code ' + code );

      if ( code > 0 ) {
        return callback( new Error( 'makensis failed' ) );
      }

      callback();
    } );

    if ( makensis.error || makensis.status > 0 ) {
      return callback( makensis.error || new Error( 'makensis failed' ) );
    }
  }
};


function _copyAssetsToTmpFolder() {
  var tmpDir         = os.tmpDir();

  fs.copySync(
    path.join( __dirname, '..', 'assets', 'win', 'nsProcess.nsh' ),
    path.join( tmpDir, 'nsProcess.nsh' )
  );

  fs.copySync(
    path.join( __dirname, '..', 'assets', 'win', 'nsProcess.dll' ),
    path.join( tmpDir, 'nsProcess.dll' )
  );

  fs.copySync(
    path.join( __dirname, '..', 'assets', 'win', 'icon.ico' ),
    path.join( tmpDir, 'icon.ico' )
  );
}


function _windowsify( path ) {
  return path.replace( /\//g, '\\' );
}

/**
 * [exports description]
 * @type {Object}
 */
module.exports = {
  init : function() {
    return Object.create( WinBuilder );
  }
};