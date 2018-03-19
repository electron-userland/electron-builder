import { chmod, copyFile, ensureDir, writeFile } from "fs-extra-p"
import { getBin } from "builder-util/out/binDownload"
import { Framework } from "./Framework"
import * as path from "path"
import MacPackager from "./macPackager"

export function createProtonFrameworkSupport(nodeVersion: string): Framework {
  return {
    name: "proton",
    version: nodeVersion,
    distMacOsAppName: "Proton.app",
    isNpmRebuildRequired: false,
    unpackFramework: async options => {
      const appContentsDir = path.join(options.appOutDir, "Proton.app/Contents")
      await ensureDir(path.join(appContentsDir, "Resources"))
      await ensureDir(path.join(appContentsDir, "MacOS"))
      await copyFile(path.join(await getBin("node", `${nodeVersion}-darwin-x64`, null), "node"), path.join(appContentsDir, "MacOS", "node"))

      // todo rename
      const appName = "Proton.app"

      // todo icon
      const appInfo = options.packager.appInfo
      await writeFile(path.join(appContentsDir, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>CFBundleName</key>
    <string>${appName}</string>
    <key>CFBundleExecutable</key>
    <string>main</string>
    <key>CFBundleIconFile</key>
    <string>Icon</string>
    <key>CFBundleIdentifier</key>
    <string>${appInfo.macBundleIdentifier}</string>
    <key>CFBundleVersion</key>
    <string>${appInfo.version}</string>
    <key>CFBundleGetInfoString</key>
    <string>0.1 built by me</string>
    <key>CFBundleShortVersionString</key>
    <string>${(options.packager as MacPackager).platformSpecificBuildOptions.bundleShortVersion || appInfo.version}</string>
  </dict>
</plist>
`)
      const appMain = ""
      await writeFile(path.join(appContentsDir, "MacOS", "main"), `#!/bin/sh
DIR=$(dirname "$0")
"$DIR/node" "$DIR/../Resources/app/${appMain}"
`, {mode: 0o755})
      await chmod(path.join(appContentsDir, "MacOS", "main"), 0o755)
    },
  }
}