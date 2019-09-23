import BluebirdPromise from "bluebird-lst"
import { Arch, log, deepAssign } from "builder-util"
import { UUID } from "builder-util-runtime"
import { getBinFromUrl } from "../binDownload"
import { walk } from "builder-util/out/fs"
import { createHash } from "crypto"
import * as ejs from "ejs"
import { readFile, writeFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { MsiOptions } from "../"
import { Target } from "../core"
import { DesktopShortcutCreationPolicy, FinalCommonWindowsInstallerOptions, getEffectiveOptions } from "../options/CommonWindowsInstallerConfiguration"
import { getTemplatePath } from "../util/pathManager"
import { VmManager } from "../vm/vm"
import { WineVmManager } from "../vm/WineVm"
import { WinPackager } from "../winPackager"
import { createStageDir, getWindowsInstallationDirName } from "./targetUtil"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("d752fe43-5d44-44d5-9fc9-6dd1bf19d5cc")
const ROOT_DIR_ID = "APPLICATIONFOLDER"

const ASSISTED_UI_FILE_NAME = "WixUI_Assisted.wxs"

const projectTemplate = new Lazy<(data: any) => string>(async () => {
  const template = (await readFile(path.join(getTemplatePath("msi"), "template.xml"), "utf8"))
    .replace(/{{/g, "<%")
    .replace(/}}/g, "%>")
    .replace(/\${([^}]+)}/g, "<%=$1%>")
  return ejs.compile(template)
})

// WiX doesn't support Mono, so, dontnet462 is required to be installed for wine (preinstalled in our bundled wine)
export default class MsiTarget extends Target {
  private readonly vm = process.platform === "win32" ? new VmManager() : new WineVmManager()

  readonly options: MsiOptions = deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msi)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("msi")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const artifactName = packager.expandArtifactBeautyNamePattern(this.options, "msi", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "MSI",
      file: artifactPath,
      arch,
    })

    const stageDir = await createStageDir(this, packager, arch)
    const vm = this.vm

    const commonOptions = getEffectiveOptions(this.options, this.packager)

    if (commonOptions.isAssisted) {
      // F*** *** ***  ***  ***  ***  ***  ***  ***  ***  ***  ***  *** WiX  ***  ***  ***  ***  ***  ***  ***  ***  ***
      // cannot understand how to set MSIINSTALLPERUSER on radio box change. In any case installed per user.
      log.warn(`MSI DOESN'T SUPPORT assisted installer. Please use NSIS instead.`)
    }

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFiles = ["project.wixobj"]
    const uiFile = commonOptions.isAssisted ?  stageDir.getTempFile(ASSISTED_UI_FILE_NAME) : null
    await writeFile(projectFile, await this.writeManifest(appOutDir, arch, commonOptions))
    if (uiFile !== null) {
      await writeFile(uiFile, await readFile(path.join(getTemplatePath("msi"), ASSISTED_UI_FILE_NAME), "utf8"))
      objectFiles.push(ASSISTED_UI_FILE_NAME.replace(".wxs", ".wixobj"))
    }

    // noinspection SpellCheckingInspection
    const vendorPath = await getBinFromUrl("wix", "4.0.0.5512.2", "/X5poahdCc3199Vt6AP7gluTlT1nxi9cbbHhZhCMEu+ngyP1LiBMn+oZX7QAZVaKeBMc2SjVp7fJqNLqsUnPNQ==")

    // noinspection SpellCheckingInspection
    const candleArgs = [
      "-arch", arch === Arch.ia32 ? "x86" : (arch === Arch.arm64 ? "arm64" : "x64"),
      `-dappDir=${vm.toVmFile(appOutDir)}`,
    ].concat(this.getCommonWixArgs())
    candleArgs.push("project.wxs")
    if (uiFile !== null) {
      candleArgs.push(ASSISTED_UI_FILE_NAME)
    }
    await vm.exec(vm.toVmFile(path.join(vendorPath, "candle.exe")), candleArgs, {
      cwd: stageDir.dir,
    })

    await this.light(objectFiles, vm, artifactPath, appOutDir, vendorPath, stageDir.dir)

    await stageDir.cleanup()

    await packager.sign(artifactPath)

    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      packager,
      arch,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "msi"),
      target: this,
      isWriteUpdateInfo: false,
    })
  }

  private async light(objectFiles: Array<string>, vm: VmManager, artifactPath: string, appOutDir: string, vendorPath: string, tempDir: string) {
    // noinspection SpellCheckingInspection
    const lightArgs = [
      "-out", vm.toVmFile(artifactPath),
      "-v",
      // https://github.com/wixtoolset/issues/issues/5169
      "-spdb",
      // https://sourceforge.net/p/wix/bugs/2405/
      // error LGHT1076 : ICE61: This product should remove only older versions of itself. The Maximum version is not less than the current product. (1.1.0.42 1.1.0.42)
      "-sw1076",
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

    // objectFiles - only filenames, we set current directory to our temp stage dir
    lightArgs.push(...objectFiles)
    await vm.exec(vm.toVmFile(path.join(vendorPath, "light.exe")), lightArgs, {
      cwd: tempDir,
    })
  }

  private getCommonWixArgs() {
    const args: Array<string> = ["-pedantic"]
    if (this.options.warningsAsErrors !== false) {
      args.push("-wx")
    }
    return args
  }

  private async writeManifest(appOutDir: string, arch: Arch, commonOptions: FinalCommonWindowsInstallerOptions) {
    const appInfo = this.packager.appInfo
    const {files, dirs} = await this.computeFileDeclaration(appOutDir)

    const companyName = appInfo.companyName
    if (!companyName) {
      log.warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
    }

    const compression = this.packager.compression
    const options = this.options
    const iconPath = await this.packager.getIconPath()
    return (await projectTemplate.value)({
      ...commonOptions,
      isCreateDesktopShortcut: commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER,
      isRunAfterFinish: options.runAfterFinish !== false,
      iconPath: iconPath == null ? null : this.vm.toVmFile(iconPath),
      compressionLevel: compression === "store" ? "none" : "high",
      version: appInfo.getVersionInWeirdWindowsForm(),
      productName: appInfo.productName,
      upgradeCode: (options.upgradeCode || UUID.v5(appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase(),
      manufacturer: companyName || appInfo.productName,
      appDescription: appInfo.description,
      // https://stackoverflow.com/questions/1929038/compilation-error-ice80-the-64bitcomponent-uses-32bitdirectory
      programFilesId: arch === Arch.x64 ? "ProgramFiles64Folder" : "ProgramFilesFolder",
      // wix in the name because special wix format can be used in the name
      installationDirectoryWixName: getWindowsInstallationDirName(appInfo, commonOptions.isPerMachine === true),
      dirs,
      files,
    })
  }

  private async computeFileDeclaration(appOutDir: string) {
    const appInfo = this.packager.appInfo
    let isRootDirAddedToRemoveTable = false
    const dirNames = new Set<string>()
    const dirs: Array<string> = []
    const fileSpace = " ".repeat(6)
    const commonOptions = getEffectiveOptions(this.options, this.packager)
    const files = await BluebirdPromise.map(walk(appOutDir), file => {
      const packagePath = file.substring(appOutDir.length + 1)

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
        // https://github.com/electron-userland/electron-builder/issues/3027
        directoryId = "d" + createHash("md5").update(dirName).digest("base64").replace(/\//g, "_").replace(/\+/g, ".").replace(/=+$/, "")
        if (!dirNames.has(dirName)) {
          dirNames.add(dirName)
          dirs.push(`<Directory Id="${directoryId}" Name="${ROOT_DIR_ID}:\\${dirName.replace(/\//g, "\\")}\\"/>`)
        }
      }
      else if (!isRootDirAddedToRemoveTable) {
        isRootDirAddedToRemoveTable = true
      }

      // since RegistryValue can be part of Component, *** *** *** *** *** *** *** *** *** wix cannot auto generate guid
      // https://stackoverflow.com/questions/1405100/change-my-component-guid-in-wix
      let result = `<Component${directoryId === null ? "" : ` Directory="${directoryId}"`}>`
      result += `\n${fileSpace}  <File Name="${fileName}" Source="$(var.appDir)${path.sep}${packagePath}" ReadOnly="yes" KeyPath="yes"`
      const isMainExecutable = packagePath === `${appInfo.productFilename}.exe`
      if (isMainExecutable) {
        result += ' Id="mainExecutable"'
      }
      else if (directoryId === null) {
        result += ` Id="${path.basename(packagePath)}_f"`
      }

      const isCreateDesktopShortcut = commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER
      if (isMainExecutable && (isCreateDesktopShortcut || commonOptions.isCreateStartMenuShortcut)) {
        result += `>\n`
        const shortcutName = commonOptions.shortcutName
        if (isCreateDesktopShortcut) {
          result += `${fileSpace}  <Shortcut Id="desktopShortcut" Directory="DesktopFolder" Name="${shortcutName}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="icon.ico"/>\n`
        }

        const hasMenuCategory = commonOptions.menuCategory != null
        const startMenuShortcutDirectoryId = hasMenuCategory ? "AppProgramMenuDir" : "ProgramMenuFolder"
        if (commonOptions.isCreateStartMenuShortcut) {
          if (hasMenuCategory) {
            dirs.push(`<Directory Id="${startMenuShortcutDirectoryId}" Name="ProgramMenuFolder:\\${commonOptions.menuCategory}\\"/>`)
          }
          result += `${fileSpace}  <Shortcut Id="startMenuShortcut" Directory="${startMenuShortcutDirectoryId}" Name="${shortcutName}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="icon.ico">\n`
          result += `${fileSpace}    <ShortcutProperty Key="System.AppUserModel.ID" Value="${this.packager.appInfo.id}"/>\n`
          result += `${fileSpace}  </Shortcut>\n`
        }
        result += `${fileSpace}</File>`

        if (hasMenuCategory) {
          result += `<RemoveFolder Id="${startMenuShortcutDirectoryId}" Directory="${startMenuShortcutDirectoryId}" On="uninstall"/>\n`
        }
      }
      else {
        result += `/>`
      }

      return `${result}\n${fileSpace}</Component>`
    })

    return {dirs: listToString(dirs, 2), files: listToString(files, 3)}
  }
}

function listToString(list: Array<string>, indentLevel:  number) {
  const space = " ".repeat(indentLevel * 2)
  return list.join(`\n${space}`)
}
