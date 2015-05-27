/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var platforms = require( './lib/platforms' );
var path      = require( 'path' );

/**
 * Prototype for electron-builder
 * @type {Object}
 */
var Builder = {
  /**
   * Build the installer for given platform
   *
   * @param  {Object}   options  option
   * @param  {Function} callback callback
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
      var configPath = path.resolve( process.cwd(), options.config );

      options.basePath = path.dirname( configPath );

      try {
        options.config = require( configPath );
      } catch( error ) {
        return callback( new Error( 'Could not load config file' ) );
      }
    }

    // FAIL when set platform is not available
    if ( !platforms[ options.platform ] ) {
      return callback(
        new Error( 'Building for ´' + options.platform + '´ is not supported' )
      );
    }

    platforms[ options.platform ].init().build( options, callback );
  }
};


/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports = {
  init : function() {
    return Object.create( Builder );
  }
};
