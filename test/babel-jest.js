"use strict"

let babel
const crypto = require("crypto")
const fs = require("fs")
const jestPreset = require("babel-preset-jest")

// compiled by ts-babel - do not transform
function isFullyCompiled(fileData) {
  return fileData.startsWith(`"use strict";`) && fileData.includes("var _")
}

const BABEL_CONFIG_VERSION = Buffer.from([1])

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
        .update(BABEL_CONFIG_VERSION)
        .update(_ref2.instrument ? "instrument" : "")
        .digest("hex")
    },
    process(src, filename, config, transformOptions) {
      // allow  ~/Documents/electron-builder/node_modules/electron-builder/out/targets/nsis.js:1

      if (require("is-ci")) {
        // precompiled on CI
        return src
      }

      const nodeModulesIndexOf = filename.indexOf("node_modules")
      if ((nodeModulesIndexOf > 0 && !filename.includes("electron-builder", nodeModulesIndexOf)) || !(filename.includes("/out/") || filename.includes("\\out\\"))) {
        // console.log(`Skip ${filename}`)
        return src
      }

      // console.log(`Do ${filename}`)

      if (babel == null) {
        babel = require('babel-core')
      }

      if (isFullyCompiled(src)) {
        // console.log(`!canCompile!o ${filename}`)
        return src
      }

      let plugins = options.plugins || []

      const lastLine = src.lastIndexOf("\n") + 1
      if (lastLine > 0 && lastLine < src.length) {
        if (src.substring(lastLine).startsWith("//#")) {
          src = src.substring(0, lastLine - 1)
        }
      }

      const sourceMapFile = `${filename}.map`
      const finalOptions = Object.assign({}, options, {
        filename,
        plugins,
        inputSourceMap: JSON.parse(fs.readFileSync(sourceMapFile, "utf-8")),
        sourceMaps: "inline",
      })
      if (transformOptions != null && transformOptions.instrument) {
        finalOptions.auxiliaryCommentBefore = ' istanbul ignore next '
        finalOptions.plugins = plugins.concat(require('babel-plugin-istanbul').default);
      }

      const result = babel.transform(src, finalOptions)
      fs.writeFileSync(sourceMapFile, JSON.stringify(result.map))
      return result.code + `\n//# sourceMappingURL=file://${sourceMapFile}`
    }
  }
}

module.exports = createTransformer()
module.exports.createTransformer = createTransformer