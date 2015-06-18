/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var fs              = require( 'fs' );
var path            = require( 'path' );
var os              = require( 'os' );

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

    if ( process.platform !== 'darwin' ) {
      return callback( new Error( 'Invalid platform.' ) );
    }

    options.log( '- Starting build for ´' + options.platform + '´ - ' );

    options.log( 'Writing temporary ´appdmg.json´' );

    options.config.osx.background         = path.join( options.basePath, options.config.osx.background );
    options.config.osx.icon               = path.join( options.basePath, options.config.osx.icon );
    options.config.osx.contents[ 1 ].path = options.appPath;

    var configFilePath = path.join( os.tmpDir(), 'appdmg.json' );

    fs.writeFileSync(
      configFilePath,
      JSON.stringify( options.config.osx ),
      {
        encoding : 'utf8'
      }
    );

    options.log( 'Wrote temporary ´appdmg.json´' );
    options.log( 'Kicking off ´appdmg´' );

    var appdmg = require( 'appdmg' );
    var ee = appdmg( {
      source : configFilePath,
      target : path.join( options.out, options.config.osx.title + '.dmg' )
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
