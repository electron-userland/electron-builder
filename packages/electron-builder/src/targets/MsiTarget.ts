import { Target } from "../core"
import { WinPackager } from "../winPackager"
import { Arch, warn } from "builder-util"
import { readFile, writeFile } from "fs-extra-p"
import { getTemplatePath } from "../util/pathManager"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import { createHelperDir } from "./targetUtil"
import { MsiOptions } from "../"
import { UUID } from "builder-util-runtime"
import BluebirdPromise from "bluebird-lst"
import { walk } from "builder-util/out/fs"
import { createHash } from "crypto"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("d752fe43-5d44-44d5-9fc9-6dd1bf19d5cc")
const ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID = UUID.parse("a1fd0bba-2e5e-48dd-8b0e-caa943b1b0c9")
const ROOT_DIR_ID = "APPLICATIONFOLDER"

export default class MsiTarget extends Target {
  readonly options: MsiOptions = deepAssign({
    perMachine: true,
  }, this.packager.platformSpecificBuildOptions, this.packager.config.msi)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("msi")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const vm = await packager.vm.value

    const stageDir = await createHelperDir(this, arch)

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFile = stageDir.getTempFile("project.wixobj")
    await writeFile(projectFile, await this.writeManifest(getTemplatePath("msi"), appOutDir, arch))

    // const vendorPath = "/Users/develar/Library/Caches/electron-builder/wix"
    const vendorPath = "C:\\Program Files (x86)\\WiX Toolset v4.0\\bin"

    const candleArgs = [
      "-arch", arch === Arch.ia32 ? "x86" : (arch === Arch.armv7l ? "arm" : "x64"),
      "-out", vm.toVmFile(objectFile),
      `-dappDir=${"C:\\Users\\develar\\win-unpacked"}`,
      "-pedantic",
    ]
    if (this.options.warningsAsErrors !== false) {
      candleArgs.push("-wx")
    }
    candleArgs.push(vm.toVmFile(projectFile))
    await vm.exec(vm.toVmFile(path.join(vendorPath, "candle.exe")), candleArgs)

    const artifactName = packager.expandArtifactNamePattern(this.options, "msi", arch)
    const artifactPath = path.join(this.outDir, artifactName)

    // noinspection SpellCheckingInspection
    const lightArgs = [
      "-out", vm.toVmFile(artifactPath),
      "-pedantic",
      "-v",
      // https://github.com/wixtoolset/issues/issues/5169
      "-spdb",
      `-dappDir=${"C:\\Users\\develar\\win-unpacked"}`,
      // "-b", "Z:\\Volumes\\test\\electron-builder-test\\dist\\win-unpacked" || vm.toVmFile(appOutDir),
    ]
    if (this.options.warningsAsErrors !== false) {
      lightArgs.push("-wx")
    }

    if (this.options.oneClick === false) {
      // lightArgs.push("-ext", vm.toVmFile(path.join(vendorPath, "WixUIExtension.dll")))
      lightArgs.push("-ext", "WixUIExtension")
    }

    lightArgs.push(vm.toVmFile(objectFile))
    await vm.exec(vm.toVmFile(path.join(vendorPath, "light.exe")), lightArgs)

    await stageDir.cleanup()

    packager.info.dispatchArtifactCreated({
      file: artifactPath,
      packager,
      arch,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "msi"),
      target: this,
      isWriteUpdateInfo: false,
    })
  }

  private async writeManifest(templatePath: string, appOutDir: string, arch: Arch) {
    const appInfo = this.packager.appInfo
    const registryKeyPathId = UUID.v5(appInfo.id, ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID)

    const dirNames = new Set<string>()
    let dirs = ""
    const fileSpace = " ".repeat(6)

    let isRootDirAddedToRemoveTable = false

    const files = await BluebirdPromise.map(walk(appOutDir), file => {
      let packagePath = file.substring(appOutDir.length + 1)
      if (path.sep !== "\\") {
        packagePath = packagePath.replace(/\//g, "\\")
      }

      let isAddRemoveFolder = false

      const lastSlash = packagePath.lastIndexOf("\\")
      const fileName = lastSlash > 0 ? packagePath.substring(lastSlash + 1) : packagePath
      let directoryId: string | null = null
      let dirName = ""
      // Wix Directory.FileSource doesn't work - https://stackoverflow.com/questions/21519388/wix-filesource-confusion
      if (lastSlash > 0) {
        // This Name attribute may also define multiple directories using the inline directory syntax.
        // For example, "ProgramFilesFolder:\My Company\My Product\bin" would create a reference to a Directory element with Id="ProgramFilesFolder" then create directories named "My Company" then "My Product" then "bin" nested beneath each other.
        // This syntax is a shortcut to defining each directory in an individual Directory element.
        dirName = packagePath.substring(0, lastSlash)
        // add U (user) suffix just to be sure that will be not overwrite system WIX directory ids.
        directoryId = `${dirName.toLowerCase()}_u`
        if (!dirNames.has(dirName)) {
          isAddRemoveFolder = true
          dirNames.add(dirName)
          dirs += `    <Directory Id="${directoryId}" Name="${ROOT_DIR_ID}:\\${dirName}\\"/>\n`
        }
      }
      else if (!isRootDirAddedToRemoveTable) {
        isRootDirAddedToRemoveTable = true
        isAddRemoveFolder = true
      }

      // since RegistryValue can be part of Component, *** *** *** *** *** *** *** *** *** wix cannot auto generate guid
      // https://stackoverflow.com/questions/1405100/change-my-component-guid-in-wix
      let result = `<Component${directoryId === null ? "" : ` Directory="${directoryId}"`} Guid="${UUID.v5(packagePath, ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID).toUpperCase()}">`
      if (!this.options.perMachine) {
        // https://stackoverflow.com/questions/16119708/component-testcomp-installs-to-user-profile-it-must-use-a-registry-key-under-hk
        result += `\n${fileSpace}  <RegistryValue Root="HKCU" Key="Software\\${registryKeyPathId}" Name="${packagePath}" Value="${appInfo.version}" Type="string" KeyPath="yes"/>`
        if (isAddRemoveFolder) {
          // https://stackoverflow.com/questions/3290576/directory-xx-is-in-the-user-profile-but-is-not-listed-in-the-removefile-table
          result += `\n${fileSpace}  <RemoveFolder Id="${hashString2(dirName, packagePath)}" On="uninstall"/>`
        }
      }
      // Id="${hashString(packagePath)}"
      result += `\n${fileSpace}  <File Name="${fileName}" Source="$(var.appDir)\\${packagePath}" ReadOnly="yes"`
      if (this.options.perMachine) {
        result += ' KeyPath="yes"'
      }
      result += `/>\n${fileSpace}</Component>`
      return result
    })

    return (await readFile(path.join(templatePath, "template.wxs"), "utf8"))
      .replace(/\$\{([a-zA-Z0-9]+)\}/g, (match, p1): string => {
        const options = this.options
        switch (p1) {
          // wix in the name because special wix format can be used in the name
          case "installationDirectoryWixName":
            const name = /^[-_+0-9a-zA-Z ]+$/.test(appInfo.productFilename) ? appInfo.productFilename : appInfo.sanitizedName
            if (options.perMachine) {
              return name
            }
            return `LocalAppDataFolder:\\Programs\\${name}\\`

          case "productName":
            return appInfo.productName

          case "manufacturer":
            const companyName = appInfo.companyName
            if (!companyName) {
              warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
            }
            return companyName || appInfo.productName

          case "upgradeCode":
            return (options.upgradeCode || UUID.v5(appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase()

          case "version":
            return appInfo.versionInWeirdWindowsForm

          case "compressionLevel":
            const compression = this.packager.compression
            return compression === "store" ? "none" : "high"

          case "uiRef":
            return options.oneClick === false ? '<UIRef Id="WixUI_Advanced" />' : ""

          case "dirs":
            return dirs

          case "files":
            return fileSpace + files.join(`\n${fileSpace}`)

          case "programFilesId":
            if (options.perMachine) {
              // https://stackoverflow.com/questions/1929038/compilation-error-ice80-the-64bitcomponent-uses-32bitdirectory
              return arch === Arch.x64 ? "ProgramFiles64Folder" : "ProgramFilesFolder"
            }
            else {
              return "LocalAppDataFolder"
            }

          default:
            throw new Error(`Macro ${p1} is not defined`)
        }
      })
  }
}

// function hashString(s: string) {
//   const hash = createHash("md5")
//   hash.update(s)
//   return hash.digest("hex")
// }

const nullByteBuffer = Buffer.from([0])

function hashString2(s: string, s2: string) {
  const hash = createHash("md5")
  hash.update(s)
  hash.update(nullByteBuffer)
  hash.update(s2)
  return hash.digest("hex")
}