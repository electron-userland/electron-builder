import { chmod, copyFile, emptyDir, ensureDir, writeFile } from "fs-extra-p"
import { getBin } from "builder-util/out/binDownload"
import { FileTransformer } from "builder-util/out/fs"
import { log } from "builder-util"
import { safeStringifyJson } from "builder-util-runtime"
import { Platform } from "./core"
import { NODE_MODULES_PATTERN } from "./fileTransformer"
import { Framework, AppInfo, PrepareApplicationStageDirectoryOptions } from "./index"
import * as path from "path"
import { LinuxPackager } from "./linuxPackager"
import MacPackager from "./macPackager"
import { build as buildPlist } from "plist"

export function createProtonFrameworkSupport(nodeVersion: string, appInfo: AppInfo): Framework {
  return new ProtonFramework(nodeVersion === "current" ? process.versions.node : nodeVersion, `${appInfo.productFilename}.app`)
}

class ProtonFramework implements Framework {
  readonly name = "proton"
  readonly isDefaultAppIconProvided = false

  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = false

  constructor(readonly version: string, readonly distMacOsAppName: string) {
  }

  createTransformer(): FileTransformer | null {
    const babel = require("babel-core")
    const babelOptions: any = {ast: false, sourceMaps: "inline"}
    if (process.env.TEST_SET_BABEL_PRESET === "true") {
      // out test dir can be located outside of electron-builder node_modules and babel cannot resolve string names of preset
      babelOptions.presets = [
        [require("babel-preset-env"), {targets: {node: this.version}}],
        require("babel-preset-stage-0"),
        require("babel-preset-react"),
      ]
      babelOptions.babelrc = false
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

    const appPlist: any = {}
    await packager.applyCommonInfo(appPlist)
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