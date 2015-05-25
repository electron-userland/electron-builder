/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var appdmg          = require( 'appdmg' );
var fs              = require( 'fs' );
var path            = require( 'path' );
var writeConfigFile = require( './helper/writeConfigFile' );
var assign          = require( 'lodash.assign' );
var os              = require( 'os' );

/**
 * Prototype for the macos installer builder
 * @type {Object}
 */
var MacosBuilder = {
  /**
   * Build the installer for macos
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  build : function( options, callback ) {
    options.log( '- Starting build for ´' + options.platform + '´ - ' );

    options.log( 'Writing temporary ´appdmg.json´' );

    options.config.macos.background         = path.join( options.basePath, options.config.macos.background );
    options.config.macos.icon               = path.join( options.basePath, options.config.macos.icon );
    options.config.macos.contents[ 1 ].path = options.appPath;

    var configFilePath = path.join( os.tmpDir(), 'appdmg.json' );

    fs.writeFileSync(
      configFilePath,
      JSON.stringify( options.config.macos ),
      {
        encoding : 'utf8'
      }
    );

    options.log( 'Wrote temporary ´appdmg.json´' );
    options.log( 'Kicking off ´appdmg´' );

    var ee = appdmg( {
      source : configFilePath,
      target : path.join( options.out, options.config.macos.title + '.dmg' )
    } );

    ee.on( 'progress', function ( info ) {
      if ( info.type === 'step-begin' ) {
        options.log( 'appdmg: [' + info.current + '] ' + info.title  );
      }
    } );

    ee.on('finish', function () {
      options.log( 'Finished ´appdmg´' );
      callback();
    } );

    ee.on( 'error', function ( error ) {
      callback( error );
    } );
  }
};


/**
 * macos installer factory
 * @type {Object}
 */
module.exports =  {
  init : function() {
    return Object.create( MacosBuilder );
  }
};