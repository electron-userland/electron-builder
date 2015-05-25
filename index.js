/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var platforms = require( './lib/platforms' );
var fs        = require( 'fs' );

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
    options.out = options.out || process.cwd();

    // FAIL when not all required options are set
    if ( !options.appPath || !options.name || !options.platform ) {
      return callback( new Error( 'Required option not set' ) );
    }

    // FAIL when set platform is not available
    if ( !platforms[ options.platform ] ) {
      return callback(
        new Error( 'Building for ´' + options.platform + '´ is not supported' )
      );
    }

    // put platform depending options handling here
    // missing
    //   macosbackround
    //   macosicon
    platforms[ options.platform ].init().build( options, callback );
  }
};


module.exports = {
  init : function() {
   return Object.create( Builder );
  }
};