'use strict';

let babel;
const crypto = require('crypto');
const fs = require('fs');
const jestPreset = require('babel-preset-jest');
const path = require('path');

const BABELRC_FILENAME = '.babelrc';

const cache = Object.create(null);

const getBabelRC = (filename, _ref) => {let useCache = _ref.useCache;
  const paths = [];
  let directory = filename;
  while (directory !== (directory = path.dirname(directory))) {
    if (useCache && cache[directory]) {
      break;
    }

    paths.push(directory);
    const configFilePath = path.join(directory, BABELRC_FILENAME);
    if (fs.existsSync(configFilePath)) {
      cache[directory] = fs.readFileSync(configFilePath, 'utf8');
      break;
    }
  }
  paths.forEach(directoryPath => {
    cache[directoryPath] = cache[directory];
  });

  return cache[directory] || '';
};

const createTransformer = options => {
  options = Object.assign({}, options, {
    presets: (options && options.presets || []).concat([jestPreset]),
  });

  delete options.cacheDirectory;

  return {
    canInstrument: true,
    getCacheKey(
    fileData,
    filename,
    configString, _ref2)

    {let instrument = _ref2.instrument,watch = _ref2.watch;
      return crypto.createHash('md5').
      update(fileData).
      update(configString)
      // Don't use the in-memory cache in watch mode because the .babelrc
      // file may be modified.
      .update(getBabelRC(filename, { useCache: !watch })).
      update(instrument ? 'instrument' : '').
      digest('hex');
    },
    process(
    src,
    filename,
    config,
    transformOptions)
    {
      if (babel == null) {
        babel = require('babel-core')
      }

      if (!babel.util.canCompile(filename)) {
        return src;
      }

      let plugins = options.plugins || [];

      // inputSourceMap: JSON.parse(fs.readFileSync(filename + ".map", "utf-8"))
      const finalOptions = Object.assign({}, options, { filename, plugins })
      if (transformOptions && transformOptions.instrument) {
        finalOptions.auxiliaryCommentBefore = ' istanbul ignore next '
        plugins = plugins.concat(require('babel-plugin-istanbul').default);
      }

      return babel.transform(src, finalOptions).code;
    } };

};

module.exports = createTransformer();
module.exports.createTransformer = createTransformer;