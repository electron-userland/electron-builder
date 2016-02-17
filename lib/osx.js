/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var fs     = require( 'fs' );
var path   = require( 'path' );
var os     = require( 'os' );
var appdmg = require( 'appdmg' );

/**
 * Prototype for the osx installer builder
 * @type {Object}
 */
var OSXBuilder = {
  /**
   * Build the installer for osx
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  build : function( options, callback ) {

    var osx = options.config.osx;

    if ( process.platform !== 'darwin' ) {
      return callback( new Error( 'Invalid platform.' ) );
    }

    options.log( '- Starting creation of installer for ´' + options.platform );

    options.log( 'Writing temporary ´appdmg.json´' );

    osx.background         = path.resolve( options.basePath, osx.background );
    osx.icon               = path.resolve( options.basePath, osx.icon );
    osx.contents[ 1 ].path = options.appPath;

    var configFilePath = path.join( os.tmpDir(), 'appdmg.json' );

    fs.writeFileSync( configFilePath, JSON.stringify( options.config.osx ) );

    options.log( 'Wrote temporary ´appdmg.json´' );
    options.log( 'Kicking off ´appdmg´' );

    var ee = appdmg( {
      source : configFilePath,
      target : path.join( options.out, osx.title + '.dmg' )
    } );

    ee.on( 'progress', function ( info ) {
      if ( info.type === 'step-begin' ) {
        options.log( 'appdmg: [' + info.current + '] ' + info.title  );
      }
    } );

    ee.on( 'finish', function () {
      options.log( 'Finished ´appdmg´' );
      callback();
    } );

    ee.on( 'error', function ( error ) {
      callback( error );
    } );
  }
};


/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports =  {
  init : function() {
    return Object.create( OSXBuilder );
  }
};
