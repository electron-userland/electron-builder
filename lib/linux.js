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
 * Prototype for the macos installer builder
 * @type {Object}
 */
var LinuxBuilder = {
  /**
   * Build the installer for linux
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  build : function( options, callback ) {

    if ( process.platform !== 'linux' ) {
      return callback( new Error( 'Invalid platform.' ) );
    }

    options.log( '- Starting build for ´' + options.platform + '´ - ' );

    options.log( 'Creating output directory ' + options.out );
    
    // mkdirp.sync(options.out);

    options.log( 'Running tar on target' );

   // var tar = require('tar')
   // tar ...
  }
};


/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports =  {
  init : function() {
    return Object.create( LinuxBuilder );
  }
};
