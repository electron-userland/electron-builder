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

/**
 * [MacosBuilder description]
 * @type {Object}
 */
var MacosBuilder = {
  /**
   * [build description]
   * @param  {[type]}   options  [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  build : function( options, callback ) {
    options.log( 'Starting build for ´' + options.platform + '´' );

    if ( options.macosBackground ) {
      options.macosBackground = path.join( process.cwd(), options.macosBackground );
    } else {
      console.log( __dirname );
      options.macosBackground = path.join( __dirname, '..', './assets/macos/installer.png' );

      options.log( [
          'No background image set.',
          '  -> Defaulting to: ' + options.macosBackground
      ].join( '\n' ) );
    }

    if ( options.macosIcon ) {
      options.macosIcon = path.join( process.cwd(), options.macosIcon );
    } else {
      options.macosIcon = path.join( __dirname, '..', './assets/macos/mount.icns' );

      options.log( [
        'No application icon set.',
        '  -> Defaulting to: ' + options.macosIcon
      ].join( '\n' ) );
    }

    options.log( 'Writing temporary ´appdmg.json´' );

    var configFilePath = writeConfigFile( 'appdmg.json', {
      name       : options.name,
      appPath    : path.join( process.cwd(), options.appPath ),
      background : options.macosBackground,
      icon       : options.macosIcon
    } );

    options.log( 'Wrote temporary ´appdmg.json´' );

    options.log( 'Kicking off ´appdmg´' );

    var ee = appdmg( {
      source : configFilePath,
      target : path.join( options.out, options.name + '.dmg' )
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
 * [exports description]
 * @type {Object}
 */
module.exports =  {
  init : function() {
    return Object.create( MacosBuilder );
  }
};