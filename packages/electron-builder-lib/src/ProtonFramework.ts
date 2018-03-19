import { chmod, copyFile, ensureDir, writeFile } from "fs-extra-p"
import { getBin } from "builder-util/out/binDownload"
import { Framework, AppInfo } from "./index"
import * as path from "path"
import MacPackager from "./macPackager"
import { build as buildPlist } from "plist"

export function createProtonFrameworkSupport(nodeVersion: string, appInfo: AppInfo): Framework {
  const appFilename = appInfo.productFilename
  const appBundleFileName = `${appFilename}.app`
  return {
    name: "proton",
    version: nodeVersion,
    distMacOsAppName: appBundleFileName,
    isNpmRebuildRequired: false,
    unpackFramework: async options => {
      const appContentsDir = path.join(options.appOutDir, appBundleFileName, "Contents")
      await ensureDir(path.join(appContentsDir, "Resources"))
      await ensureDir(path.join(appContentsDir, "MacOS"))
      await copyFile(path.join(await getBin("node", `${nodeVersion}-darwin-x64`, null), "node"), path.join(appContentsDir, "MacOS", "node"))

      const appPlist: any = {
        CFBundleExecutable: "main",
      }
      await (options.packager as MacPackager).applyCommonInfo(appPlist)
      await writeFile(path.join(appContentsDir, "Info.plist"), buildPlist(appPlist))
      await writeFile(path.join(appContentsDir, "MacOS", "main"), `#!/bin/sh
DIR=$(dirname "$0")
"$DIR/node" "$DIR/../Resources/app/${options.packager.info.metadata.main || "index.js"}"
`, {mode: 0o755})
      await chmod(path.join(appContentsDir, "MacOS", "main"), 0o755)
    },
  }
}