import { FileTransformer } from "builder-util/out/fs"
import { log } from "builder-util"
import { safeStringifyJson } from "builder-util-runtime"
import { Platform } from "./core"
import { NODE_MODULES_PATTERN } from "./fileTransformer"
import { LibUiFramework } from "./frameworks/LibUiFramework"
import { getTemplatePath } from "./util/pathManager"

export class ProtonFramework extends LibUiFramework {
  readonly name = "proton"

  // noinspection JSUnusedGlobalSymbols
  readonly defaultAppIdPrefix = "com.proton-native."

  constructor(version: string, distMacOsAppName: string, isUseLaunchUi: boolean) {
    super(version, distMacOsAppName, isUseLaunchUi)
  }

  getDefaultIcon(platform: Platform) {
    if (platform === Platform.WINDOWS) {
      return getTemplatePath("icons/proton-native/proton-native.ico")
    }
    else if (platform === Platform.LINUX) {
      return getTemplatePath("icons/proton-native/linux")
    }
    else {
      return getTemplatePath("icons/proton-native/proton-native.icns")
    }
  }

  createTransformer(): FileTransformer | null {
    let babel: any
    const babelOptions: any = {ast: false, sourceMaps: "inline"}
    if (process.env.TEST_SET_BABEL_PRESET === "true") {
      babel = require("@babel/core")
      babel = testOnlyBabel(babel, babelOptions, this.version)
    }
    else {
      try {
        babel = require("babel-core")
      }
      catch (e) {
        // babel isn't installed
        log.debug(null, "don't transpile source code using Babel")
        return null
      }
    }

    log.info({options: safeStringifyJson(babelOptions, new Set<string>(["presets"]))}, "transpile source code using Babel")
    return file => {
      if (!(file.endsWith(".js") || file.endsWith(".jsx")) || file.includes(NODE_MODULES_PATTERN)) {
        return null
      }

      return new Promise((resolve, reject) => {
        return babel.transformFile(file, babelOptions, (error: Error, result: any) => {
          if (error == null) {
            resolve(result.code)
          }
          else {
            reject(error)
          }
        })
      })
    }
  }
}

function testOnlyBabel(babel: any, babelOptions: any, nodeVersion: string) {
  // out test dir can be located outside of electron-builder node_modules and babel cannot resolve string names of preset
  babelOptions.presets = [
    [require("@babel/preset-env").default, {targets: {node: nodeVersion}}],
    require("@babel/preset-react"),
  ]
  babelOptions.plugins = [
    // stage 0
    require("@babel/plugin-proposal-function-bind").default,

    // stage 1
    require("@babel/plugin-proposal-export-default-from").default,
    require("@babel/plugin-proposal-logical-assignment-operators").default,
    [require("@babel/plugin-proposal-optional-chaining").default, {loose: false}],
    [require("@babel/plugin-proposal-pipeline-operator").default, {proposal: "minimal"}],
    [require("@babel/plugin-proposal-nullish-coalescing-operator").default, {loose: false}],
    require("@babel/plugin-proposal-do-expressions").default,

    // stage 2
    [require("@babel/plugin-proposal-decorators").default, {legacy: true}],
    require("@babel/plugin-proposal-function-sent").default,
    require("@babel/plugin-proposal-export-namespace-from").default,
    require("@babel/plugin-proposal-numeric-separator").default,
    require("@babel/plugin-proposal-throw-expressions").default,

    // stage 3
    require("@babel/plugin-syntax-dynamic-import").default,
    require("@babel/plugin-syntax-import-meta").default,
    [require("@babel/plugin-proposal-class-properties").default, {loose: false}],
    require("@babel/plugin-proposal-json-strings").default,
  ]
  babelOptions.babelrc = false
  return babel
}