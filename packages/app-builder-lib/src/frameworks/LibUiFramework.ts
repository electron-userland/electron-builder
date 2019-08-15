import { chmod, emptyDir, ensureDir, rename, writeFile } from "fs-extra"
import * as path from "path"
import { executeAppBuilder } from "builder-util"
import { AfterPackContext } from "../configuration"
import { Platform } from "../core"
import { Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { LinuxPackager } from "../linuxPackager"
import MacPackager from "../macPackager"
import { executeAppBuilderAndWriteJson } from "../util/appBuilder"

export class LibUiFramework implements Framework {
  readonly name: string = "libui"
  // noinspection JSUnusedGlobalSymbols
  readonly macOsDefaultTargets = ["dmg"]

  readonly defaultAppIdPrefix: string = "com.libui."

  // noinspection JSUnusedGlobalSymbols
  readonly isCopyElevateHelper = false

  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = false

  constructor(readonly version: string, readonly distMacOsAppName: string, protected readonly isUseLaunchUi: boolean) {
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    await emptyDir(options.appOutDir)

    const packager = options.packager
    const platform = packager.platform

    if (this.isUseLaunchUiForPlatform(platform)) {
      const appOutDir = options.appOutDir
      await executeAppBuilder(["proton-native",
        "--node-version", this.version,
        "--use-launch-ui",
        "--platform", platform.nodeName,
        "--arch", options.arch,
        "--stage", appOutDir,
        "--executable", `${packager.appInfo.productFilename}${platform === Platform.WINDOWS ? ".exe" : ""}`,
      ])
      return
    }

    if (platform === Platform.MAC) {
      await this.prepareMacosApplicationStageDirectory(packager as MacPackager, options)
    }
    else if (platform === Platform.LINUX) {
      await this.prepareLinuxApplicationStageDirectory(options)
    }
  }

  private async prepareMacosApplicationStageDirectory(packager: MacPackager, options: PrepareApplicationStageDirectoryOptions) {
    const appContentsDir = path.join(options.appOutDir, this.distMacOsAppName, "Contents")
    await ensureDir(path.join(appContentsDir, "Resources"))
    await ensureDir(path.join(appContentsDir, "MacOS"))
    await executeAppBuilder(["proton-native", "--node-version", this.version, "--platform", "darwin", "--stage", path.join(appContentsDir, "MacOS")])

    const appPlist: any = {
      // https://github.com/albe-rosado/create-proton-app/issues/13
      NSHighResolutionCapable: true,
    }
    await packager.applyCommonInfo(appPlist, appContentsDir)
    await Promise.all([
      executeAppBuilderAndWriteJson(["encode-plist"], {[path.join(appContentsDir, "Info.plist")]: appPlist}),
      writeExecutableMain(path.join(appContentsDir, "MacOS", appPlist.CFBundleExecutable), `#!/bin/sh
  DIR=$(dirname "$0")
  "$DIR/node" "$DIR/../Resources/app/${options.packager.info.metadata.main || "index.js"}"
  `),
    ])
  }

  private async prepareLinuxApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    const appOutDir = options.appOutDir
    await executeAppBuilder(["proton-native", "--node-version", this.version, "--platform", "linux", "--arch", options.arch, "--stage", appOutDir])
    const mainPath = path.join(appOutDir, (options.packager as LinuxPackager).executableName)
    await writeExecutableMain(mainPath, `#!/bin/sh
  DIR=$(dirname "$0")
  "$DIR/node" "$DIR/app/${options.packager.info.metadata.main || "index.js"}"
  `)
  }

  async afterPack(context: AfterPackContext) {
    const packager = context.packager
    if (!this.isUseLaunchUiForPlatform(packager.platform)) {
      return
    }

    // LaunchUI requires main.js, rename if need
    const userMain = packager.info.metadata.main || "index.js"
    if (userMain === "main.js") {
      return
    }

    await rename(path.join(context.appOutDir, "app", userMain), path.join(context.appOutDir, "app", "main.js"))
  }

  getMainFile(platform: Platform): string | null {
    return this.isUseLaunchUiForPlatform(platform) ? "main.js" : null
  }

  private isUseLaunchUiForPlatform(platform: Platform) {
    return platform === Platform.WINDOWS || (this.isUseLaunchUi && platform === Platform.LINUX)
  }

  getExcludedDependencies(platform: Platform): Array<string> | null {
    // part of launchui
    return this.isUseLaunchUiForPlatform(platform) ? ["libui-node"] : null
  }
}

async function writeExecutableMain(file: string, content: string) {
  await writeFile(file, content, {mode: 0o755})
  await chmod(file, 0o755)
}