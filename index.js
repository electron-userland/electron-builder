/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var platforms = require( './lib/platforms' );
var fs        = require( 'fs' );
var path      = require( 'path' );
var assign    = require( 'lodash.assign' );

var Builder = {
  /**
   * [build description]
   * @param  {[type]}   options  [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  build : function( options, callback ) {
    options     = options || {};
    options.log = options.log || console.log;
    options.out = options.out ? path.resolve( process.cwd(), options.out ) : process.cwd();

    // make sure the output directory
    // ends with a slash
    if ( options.out[ options.out.length - 1 ] !== path.sep ) {
      options.out += path.sep;
    }

    // FAIL when not all required options are set
    if ( !options.appPath || !options.platform || !options.config ) {
      return callback( new Error( 'Required option not set' ) );
    }

    if ( typeof options.config === 'string' ) {
      var configPath = path.join( process.cwd(), options.config );

      options.basePath = path.dirname( configPath );

      try {
        options.config   = require( configPath );
      } catch( error ) {
        return callback( new Error( 'Could not load config file' ) );
      }
    }

    options.config.macos.contents[ 1 ].path = options.out;


    // FAIL when set platform is not available
    if ( !platforms[ options.platform ] ) {
      return callback(
        new Error( 'Building for ´' + options.platform + '´ is not supported' )
      );
    }

    platforms[ options.platform ].init().build( options, callback );
  }
};


module.exports = {
  init : function() {
   return Object.create( Builder );
  }
};