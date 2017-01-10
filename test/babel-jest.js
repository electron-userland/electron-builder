'use strict'

let babel
const crypto = require('crypto')
const fs = require('fs')
const jestPreset = require('babel-preset-jest')
const path = require('path')

const convert = require("convert-source-map")

let babelRc;

function getBabelRcDigest() {
  if (babelRc == null) {
    babelRc = crypto
      .createHash("md5")
      .update(fs.readFileSync(path.join(__dirname, "..", ".babelrc"), "utf8"))
      .digest("hex")
  }
  return babelRc;
}

// compiled by ts-babel - do not transform
function isFullyCompiled(fileData) {
  return fileData.startsWith(`"use strict";`) && fileData.includes("var _")
}

function createTransformer(options) {
  options = Object.assign({}, options, {
    presets: (options && options.presets || []).concat([jestPreset]),
  })

  delete options.cacheDirectory

  return {
    canInstrument: true,
    getCacheKey(fileData, filename, configString, _ref2) {
      return crypto.createHash("md5")
        .update(fileData)
        .update(isFullyCompiled(fileData) ? "f": "p")
        .update(configString)
        .update(getBabelRcDigest())
        .update(_ref2.instrument ? "instrument" : "")
        .digest("hex")
    },
    process(src, filename, config, transformOptions) {
      if (babel == null) {
        babel = require('babel-core')
      }

      if (!babel.util.canCompile(filename) || isFullyCompiled(src)) {
        return src
      }

      let plugins = options.plugins || []

      const lastLine = src.lastIndexOf("\n") + 1
      if (lastLine > 0 && lastLine < src.length) {
        if (src.substring(lastLine).startsWith("//#")) {
          src = src.substring(0, lastLine - 1)
        }
      }

      const finalOptions = Object.assign({}, options, {
        filename,
        plugins,
        inputSourceMap: JSON.parse(fs.readFileSync(filename + ".map", "utf-8")),
        sourceMaps: "inline",
      })
      if (transformOptions && transformOptions.instrument) {
        finalOptions.auxiliaryCommentBefore = ' istanbul ignore next '
        finalOptions.plugins = plugins.concat(require('babel-plugin-istanbul').default);
      }

      const result = babel.transform(src, finalOptions)
      const codeWithSourceMapUrl = result.code + "\n//# sourceMappingURL=data:application/json;base64," + convert.fromObject(result.map).toBase64()
      return codeWithSourceMapUrl
    }
  }
}

module.exports = createTransformer()
module.exports.createTransformer = createTransformer