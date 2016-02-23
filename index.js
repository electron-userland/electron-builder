/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var platforms = require( './lib/platforms' );
var path      = require( 'path' );
var fs        = require( 'fs' );
var fse    = require( 'fs-extra' );


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
    options.out = options.out
                  ? path.resolve( process.cwd(), options.out )
                  : process.cwd();

    options.log(
      '- Running electron-builder ' + require( './package' ).version
    );

    // make sure the output
    // directory ends with a slash
    if ( options.out[ options.out.length - 1 ] !== path.sep ) {
      options.out += path.sep;
    }

    // make sure the output
    // directory exists
    if ( !fs.existsSync( options.out ) ) {
      options.log( '- Ouput directory ´' + options.out + '´ does not exist ' );
      fse.mkdirsSync( options.out );
      options.log( '- Created ´' + options.out + '´ ' );
    }

    // FAIL when not all required options are set
    if (
      !options.appPath ||
      !options.platform ||
      !options.config ||
      !options.basePath
    ) {
      return callback( new Error( 'Required option not set' ) );
    }

    // FAIL when no configuration for desired platform is found
    if (
      ! options.config[ options.platform ]
    ) {
      return callback( new Error(
        'No config property found for `' + options.platform + '`.\n' +
        'Please check your configuration file and the documentation.'
      ) );
    }

    // Make sure appPath is absolute
    options.appPath = path.resolve( options.appPath );

    try {
      platforms( options.platform ).init().build( options, callback );
    } catch( error ) {
      return callback( error );
    }
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
