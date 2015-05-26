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
      appPath   : _windowsify( options.appPath ),
      name      : options.config.win.title,
      out       : _windowsify( options.out )
    } );

    _copyAssetsToTmpFolder( options );

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
 * paths for windows
 *
 * @param  {String} path path
 * @return {String}      windows path
 */
function _windowsify( path ) {
  return path.replace( /\//g, '\\' );
}

/**
 * win installer factory
 * @type {Object}
 */
module.exports = {
  init : function() {
    return Object.create( WinBuilder );
  }
};