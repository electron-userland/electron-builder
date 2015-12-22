/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var fs       = require( 'fs' );
var template = require( 'lodash.template' );
var os       = require( 'os' );
var path     = require( 'path' );


/**
 * Read config template file, render it with given
 * options and write it into temporary folder
 *
 * @param  {String} templatePath    path of the given config file
 * @param  {Object} options         options to render the template with
 * @return {String}                 File path to temporary written config file
 */
module.exports = function( templatePath, options ) {
  var configTemplate = fs.readFileSync(
    path.resolve( templatePath ),
    { encoding : 'utf8' }
  );

  var config     = template(
    configTemplate,
    {
      // set interpolate explicitely
      // to avoid troubles with templating of
      // installer.nsi.tpl
      interpolate : /<%=([\s\S]+?)%>/g
    }
  )( options );

  var outputPath = path.join( 
      os.tmpDir(), 
      ( Math.random() * 1e32 ).toString( 36 ) + path.basename( '.tpl' )
    );

  fs.writeFileSync(
    outputPath,
    config,
    {
      encoding : 'utf8'
    }
  );

  return outputPath;
};
