import { chmod, emptyDir, ensureDir, writeFile } from "fs-extra-p"
import { getBin } from "./binDownload"
import { FileTransformer, copyFile } from "builder-util/out/fs"
import { log } from "builder-util"
import { safeStringifyJson } from "builder-util-runtime"
import { Platform } from "./core"
import { NODE_MODULES_PATTERN } from "./fileTransformer"
import { Framework, AppInfo, PrepareApplicationStageDirectoryOptions } from "./index"
import * as path from "path"
import { LinuxPackager } from "./linuxPackager"
import MacPackager from "./macPackager"
import { build as buildPlist } from "plist"
import { getTemplatePath } from "./util/pathManager"

export function createProtonFrameworkSupport(nodeVersion: string, appInfo: AppInfo): Framework {
  return new ProtonFramework(nodeVersion === "current" ? process.versions.node : nodeVersion, `${appInfo.productFilename}.app`)
}

class ProtonFramework implements Framework {
  readonly name = "proton"
  readonly isDefaultAppIconProvided = false
  readonly macOsDefaultTargets = ["dmg"]
  readonly defaultAppIdPrefix = "com.proton-native."

  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = false

  constructor(readonly version: string, readonly distMacOsAppName: string) {
  }

  getDefaultIcon() {
    return getTemplatePath("proton-native.icns")
  }

  createTransformer(): FileTransformer | null {
    let babel: any
    const babelOptions: any = {ast: false, sourceMaps: "inline"}
    if (process.env.TEST_SET_BABEL_PRESET === "true") {
      babel = require("@babel/core")
      // out test dir can be located outside of electron-builder node_modules and babel cannot resolve string names of preset
      babelOptions.presets = [
        [require("@babel/preset-env").default, {targets: {node: this.version}}],
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

  private async prepareMacosApplicationStageDirectory(packager: MacPackager, options: PrepareApplicationStageDirectoryOptions) {
    const appContentsDir = path.join(options.appOutDir, this.distMacOsAppName, "Contents")
    await ensureDir(path.join(appContentsDir, "Resources"))
    await ensureDir(path.join(appContentsDir, "MacOS"))
    await copyFile(path.join(await getBin("node", `${this.version}-darwin-x64`, null), "node"), path.join(appContentsDir, "MacOS", "node"))

    const appPlist: any = {
      // https://github.com/albe-rosado/create-proton-app/issues/13
      NSHighResolutionCapable: true,
    }
    await packager.applyCommonInfo(appPlist, appContentsDir)
    await Promise.all([
      writeFile(path.join(appContentsDir, "Info.plist"), buildPlist(appPlist)),
      writeExecutableMain(path.join(appContentsDir, "MacOS", appPlist.CFBundleExecutable), `#!/bin/sh
DIR=$(dirname "$0")
"$DIR/node" "$DIR/../Resources/app/${options.packager.info.metadata.main || "index.js"}"
`),
    ])
  }

  private async prepareLinuxApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    const appOutDir = options.appOutDir
    await copyFile(path.join(await getBin("node", `${this.version}-linux-${options.arch === "ia32" ? "x86" : options.arch}`, null), "node"), path.join(appOutDir, "node"))
    const mainPath = path.join(appOutDir, (options.packager as LinuxPackager).executableName)
    await writeExecutableMain(mainPath, `#!/bin/sh
DIR=$(dirname "$0")
"$DIR/node" "$DIR/app/${options.packager.info.metadata.main || "index.js"}"
`)
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    await emptyDir(options.appOutDir)

    const packager = options.packager
    if (packager.platform === Platform.MAC) {
      await this.prepareMacosApplicationStageDirectory(packager as MacPackager, options)
    }
    else if (packager.platform === Platform.LINUX) {
      await this.prepareLinuxApplicationStageDirectory(options)
    }
    else {
      throw new Error(`Unsupported platform: ${packager.platform}`)
    }
  }
}

async function writeExecutableMain(file: string, content: string) {
  await writeFile(file, content, {mode: 0o755})
  await chmod(file, 0o755)
}
