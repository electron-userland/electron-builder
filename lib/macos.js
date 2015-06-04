/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

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

    switch( process.platform ) {
      case 'darwin':
        buildDarwin(options, callback);
        break;
      case 'linux':
        buildLinux(options, callback);
        break;
      default:
        return callback( new Error( 'Invalid platform.' ) ); // win32 not currently supported.
    }
  },

  /**
   * Build the installer for macos using appdmg, when on the darwin platform
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  buildDarwin: function( options, callback ) {

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

    var appdmg = require( 'appdmg' );
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

  },

  /**
   * Build the installer for macos using genisoimage, when on the linux platform
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  buildLinux : function( options, callback ) {

    options.log( 'Kicking off ´genisoimage´' );

    var title = options.config.darwin.title
    var genisoimage = childProcess.spawn(
      'genisoimage',
      [ '-V', title, '-D', '-R', '-apple', '-no-pad', '-o', path.join(options.out, title + '.dmg'), '-graft-points', title + '.app=' + options.appPath ],
      {
        env   : process.env
      }
    );

    genisoimage.stdout.on( 'data', function ( data ) {
      options.log( 'genisoimage: ' + data );
    } );

    genisoimage.stderr.on( 'data', function ( data ) {
      options.log('genisoimage error: ' + data);
    });

    genisoimage.on( 'error', function ( err ) {
      return callback(err);
    });

    genisoimage.on( 'close', function ( code ) {
      options.log( 'Finished genisoimage with code ' + code );

      if ( code > 0 ) {
        return callback( new Error( 'genisoimage failed' ) );
      }

      callback();
    });

    if ( genisoimage.error || genisoimage.status > 0 ) {
      return callback( genisoimage.error || new Error( 'genisoimage failed' ) );
    }
  },
};


/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports =  {
  init : function() {
    return Object.create( MacosBuilder );
  }
};
