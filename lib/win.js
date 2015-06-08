/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var childProcess    = require( 'child_process' );
var os              = require( 'os' );
var writeConfigFile = require( './helper/writeConfigFile' );
var path            = require( 'path' );
var fs              = require( 'fs-extra' );

/**
 * Prototype for the windows installer builder
 * @type {Object}
 */
var WinBuilder = {
  /**
   * Build the installer for windows
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  build : function( options, callback ) {
    options.log( '- Starting build for ´' + options.platform + '´ - ' );

    var configFilePath = writeConfigFile( 'installer.nsi', {
      appPath : _windowsify( options.appPath ),
      name    : options.config.win.title,
      out     : _windowsify( options.out )
    } );

    _copyAssetsToTmpFolder( options );

    var makensis = childProcess.spawn(
      'makensis',
      [ configFilePath ],
      {
        env : process.env
      }
    );

    makensis.stdout.on( 'data', function ( data ) {
      options.log( 'makensis: ' + data );
    } );

    makensis.stderr.on( 'data', function ( data ) {
      options.log( 'makensis error: ' + data );
    } );

    makensis.on( 'error', function ( err ) {
      if ( err.code === 'ENOENT' ) {
        options.log( '- makensis not found.' );
        options.log( '  Please install "nullsoft scriptable install system"' );
        switch( process.platform ) {
          case 'darwin':
            options.log( '  brew install wine makensis' );
            break;
          case 'win32':
            options.log( '  http://nsis.sourceforge.net/Download' );
            break;
          case 'linux':
            options.log( '  $ add-apt-repository ppa:ubuntu-wine/ppa -y' );
            options.log( '  $ apt-get update' );
            options.log( '  $ apt-get install wine nsis -y' );
            break;
        }
        options.log();
        return callback( new Error( 'makensis failed' ) );
      }
      return callback( err );
    } );

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


/**
 * Copy files to tmp dir to
 * make them accessible for installer.nsi
 */
function _copyAssetsToTmpFolder( options ) {
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
    path.resolve( options.config.win.icon ),
    path.join( tmpDir, 'icon.ico' )
  );
}


/**
 * Replace / with \ to write file
 * also, ensure drive character is upper case when run on windows platforms
 * paths for windows
 *
 * @param  {String} path path
 * @return {String}      windows path
 */
function _windowsify( p ) {
  p = path.win32.normalize( p );
  p = p[ 0 ].toUpperCase() + p.substr( 1 );
  return p;
}

/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports = {
  init : function() {
    return Object.create( WinBuilder );
  }
};
