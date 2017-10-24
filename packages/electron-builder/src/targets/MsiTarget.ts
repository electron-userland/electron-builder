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
import { VmManager } from "../vm/vm"
import { WineVmManager } from "../vm/wine"
import * as ejs from "ejs"
import { Lazy } from "lazy-val"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { getEffectiveOptions } from "../options/CommonWindowsInstallerOptions"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("d752fe43-5d44-44d5-9fc9-6dd1bf19d5cc")
const ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID = UUID.parse("a1fd0bba-2e5e-48dd-8b0e-caa943b1b0c9")
const ROOT_DIR_ID = "APPLICATIONFOLDER"

const projectTemplate = new Lazy<(data: any) => string>(async () => {
  return ejs.compile(await readFile(path.join(getTemplatePath("msi"), "template.wxs"), "utf8"))
})

// WiX doesn't support Mono, so, dontnet462 is required to be installed for wine (preinstalled in our bundled wine)
export default class MsiTarget extends Target {
  readonly options: MsiOptions = deepAssign({
    perMachine: true,
  }, this.packager.platformSpecificBuildOptions, this.packager.config.msi)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("msi")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const stageDir = await createHelperDir(this, arch)
    const vm = process.platform === "win32" ? new VmManager() : new WineVmManager()

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFile = stageDir.getTempFile("project.wixobj")
    await writeFile(projectFile, await this.writeManifest(appOutDir, arch))

    // noinspection SpellCheckingInspection
    const vendorPath = await getBinFromGithub("wix", "4.0.0.5512.2", "/X5poahdCc3199Vt6AP7gluTlT1nxi9cbbHhZhCMEu+ngyP1LiBMn+oZX7QAZVaKeBMc2SjVp7fJqNLqsUnPNQ==")

    // noinspection SpellCheckingInspection
    const candleArgs = [
      "-arch", arch === Arch.ia32 ? "x86" : (arch === Arch.armv7l ? "arm" : "x64"),
      "-out", vm.toVmFile(objectFile),
      // `-dappDir=${"C:\\Users\\develar\\win-unpacked"}`,
      `-dappDir=${vm.toVmFile(appOutDir)}`,
    ].concat(this.getCommonWixArgs())
    candleArgs.push(vm.toVmFile(projectFile))
    await vm.exec(vm.toVmFile(path.join(vendorPath, "candle.exe")), candleArgs)

    const artifactName = packager.expandArtifactNamePattern(this.options, "msi", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await this.light(objectFile, vm, artifactPath, appOutDir, vendorPath)

    await stageDir.cleanup()

    await packager.sign(artifactPath)

    packager.info.dispatchArtifactCreated({
      file: artifactPath,
      packager,
      arch,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "msi"),
      target: this,
      isWriteUpdateInfo: false,
    })
  }

  private async light(objectFile: string, vm: VmManager, artifactPath: string, appOutDir: string, vendorPath: string) {
    // noinspection SpellCheckingInspection
    const lightArgs = [
      "-out", vm.toVmFile(artifactPath),
      "-v",
      // https://github.com/wixtoolset/issues/issues/5169
      "-spdb",
      // https://sourceforge.net/p/wix/bugs/2405/
      // error LGHT1076 : ICE61: This product should remove only older versions of itself. The Maximum version is not less than the current product. (1.1.0.42 1.1.0.42)
      "-sw1076",
      // `-dappDir=${"C:\\Users\\develar\\win-unpacked"}`,
      `-dappDir=${vm.toVmFile(appOutDir)}`,
      // "-dcl:high",
    ].concat(this.getCommonWixArgs())

    // http://windows-installer-xml-wix-toolset.687559.n2.nabble.com/Build-3-5-2229-0-give-me-the-following-error-error-LGHT0216-An-unexpected-Win32-exception-with-errorn-td5707443.html
    if (process.platform !== "win32") {
      // noinspection SpellCheckingInspection
      lightArgs.push("-sval")
    }

    if (this.options.oneClick === false) {
      lightArgs.push("-ext", "WixUIExtension")
    }

    lightArgs.push(vm.toVmFile(objectFile))
    await vm.exec(vm.toVmFile(path.join(vendorPath, "light.exe")), lightArgs)
  }

  private getCommonWixArgs() {
    const args: Array<string> = ["-pedantic"]
    if (this.options.warningsAsErrors !== false) {
      args.push("-wx")
    }
    return args
  }

  private async writeManifest(appOutDir: string, arch: Arch) {
    const appInfo = this.packager.appInfo
    const {files, dirs} = await this.computeFileDeclaration(appOutDir)

    const companyName = appInfo.companyName
    if (!companyName) {
      warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
    }

    const commonOptions = getEffectiveOptions(this.options, this.packager)
    const compression = this.packager.compression
    const options = this.options
    const text = (await projectTemplate.value)({
      isRunAfterFinish: options.runAfterFinish !== false,
      isAssisted: options.oneClick === false,
      iconPath: await this.packager.getIconPath(),
      compressionLevel: compression === "store" ? "none" : "high",
      version: appInfo.versionInWeirdWindowsForm,
      productName: appInfo.productName,
      upgradeCode: (options.upgradeCode || UUID.v5(appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase(),
      manufacturer: companyName || appInfo.productName,
      isCreateDesktopShortcut: commonOptions.createDesktopShortcut,
      shortcutName: commonOptions.shortcutName,
      appDescription: appInfo.description,
      startMenuDirectoryPath: `ProgramMenuFolder:\\${commonOptions.menuCategory == null ? "" : `${commonOptions.menuCategory}\\`}${commonOptions.shortcutName}\\`
    })

    return text
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

          case "dirs":
            return dirs

          case "files":
            return files

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

  private async computeFileDeclaration(appOutDir: string) {
    const appInfo = this.packager.appInfo
    const registryKeyPathId = UUID.v5(appInfo.id, ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID)
    let isRootDirAddedToRemoveTable = false
    const dirNames = new Set<string>()
    let dirs = ""
    const fileSpace = " ".repeat(6)
    const commonOptions = getEffectiveOptions(this.options, this.packager)
    const files = await BluebirdPromise.map(walk(appOutDir), file => {
      const packagePath = file.substring(appOutDir.length + 1)
      let isAddRemoveFolder = false

      const lastSlash = packagePath.lastIndexOf(path.sep)
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
      let result = `<Component${directoryId === null ? "" : ` Directory="${directoryId}"`}`
      const options = this.options
      if (!options.perMachine) {
        result += ` Guid="${UUID.v5(packagePath, ELECTRON_BUILDER_COMPONENT_KEY_PATH_NS_UUID).toUpperCase()}">`

        // https://stackoverflow.com/questions/16119708/component-testcomp-installs-to-user-profile-it-must-use-a-registry-key-under-hk
        result += `\n${fileSpace}  <RegistryValue Root="HKCU" Key="Software\\${registryKeyPathId}" Name="${packagePath}" Value="${appInfo.version}" Type="string" KeyPath="yes"/>`
        if (isAddRemoveFolder) {
          // https://stackoverflow.com/questions/3290576/directory-xx-is-in-the-user-profile-but-is-not-listed-in-the-removefile-table
          result += `\n${fileSpace}  <RemoveFolder Id="${hashString2(dirName, packagePath)}" On="uninstall"/>`
        }
      }
      else {
        result += ">"
      }

      result += `\n${fileSpace}  <File Name="${fileName}" Source="$(var.appDir)${path.sep}${packagePath}" ReadOnly="yes"`
      if (options.perMachine) {
        result += ' KeyPath="yes"'
      }
      const isMainExecutable = packagePath === `${appInfo.productFilename}.exe`
      if (isMainExecutable) {
        result += ' Id="mainExecutable"'
      }
      else if (directoryId === null) {
        result += ` Id="${path.basename(packagePath)}_f"`
      }
      if (isMainExecutable && (commonOptions.createDesktopShortcut || commonOptions.createStartMenuShortcut)) {
        result += `>\n`
        const shortcutName = commonOptions.shortcutName
        if (commonOptions.createDesktopShortcut) {
          result += `${fileSpace}  <Shortcut Id="desktopShortcut" Directory="DesktopFolder" Name="${shortcutName}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="icon.ico"/>\n`
        }
        if (commonOptions.createStartMenuShortcut) {
          result += `${fileSpace}  <Shortcut Id="startMenuShortcut" Directory="ProgramMenuDir" Name="${shortcutName}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="icon.ico"/>\n`
        }
        result += `${fileSpace}</File>`
      }
      else {
        result += `/>`
      }

      return `${result}\n${fileSpace}</Component>`
    })

    return {dirs, files: fileSpace + files.join(`\n${fileSpace}`)}
  }
}

const nullByteBuffer = Buffer.from([0])

function hashString2(s: string, s2: string) {
  const hash = createHash("md5")
  hash.update(s)
  hash.update(nullByteBuffer)
  hash.update(s2)
  return hash.digest("hex")
}