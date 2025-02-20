import { Arch, asArray, deepAssign, log, walk } from "builder-util"
import { UUID } from "builder-util-runtime"
import { createHash } from "crypto"
import * as ejs from "ejs"
import { readFile, writeFile } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import { MsiOptions } from "../"
import { getBinFromUrl } from "../binDownload"
import { Target } from "../core"
import { DesktopShortcutCreationPolicy, FinalCommonWindowsInstallerOptions, getEffectiveOptions } from "../options/CommonWindowsInstallerConfiguration"
import { normalizeExt } from "../platformPackager"
import { getTemplatePath } from "../util/pathManager"
import { VmManager } from "../vm/vm"
import { WineVmManager } from "../vm/WineVm"
import { WinPackager } from "../winPackager"
import { createStageDir, getWindowsInstallationDirName } from "./targetUtil"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("d752fe43-5d44-44d5-9fc9-6dd1bf19d5cc")
const ROOT_DIR_ID = "APPLICATIONFOLDER"

// WiX doesn't support Mono, so, dontnet462 is required to be installed for wine (preinstalled in our bundled wine)
export default class MsiTarget extends Target {
  protected readonly vm = process.platform === "win32" ? new VmManager() : new WineVmManager()

  readonly options: MsiOptions = deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msi)

  constructor(
    protected readonly packager: WinPackager,
    readonly outDir: string,
    name = "msi",
    isAsyncSupported = true
  ) {
    super(name, isAsyncSupported)
  }

  protected projectTemplate = new Lazy<(data: any) => string>(async () => {
    const template = (await readFile(path.join(getTemplatePath(this.name), "template.xml"), "utf8"))
      .replace(/{{/g, "<%")
      .replace(/}}/g, "%>")
      .replace(/\${([^}]+)}/g, "<%=$1%>")
    return ejs.compile(template)
  })

  /**
   * A product-specific string that can be used in an [MSI Identifier](https://docs.microsoft.com/en-us/windows/win32/msi/identifier).
   */
  private get productMsiIdPrefix() {
    const sanitizedId = this.packager.appInfo.productFilename.replace(/[^\w.]/g, "").replace(/^[^A-Za-z_]+/, "")
    return sanitizedId.length > 0 ? sanitizedId : "App" + this.upgradeCode.replace(/-/g, "")
  }

  protected get iconId() {
    return `${this.productMsiIdPrefix}Icon.exe`
  }

  protected get upgradeCode(): string {
    return (this.options.upgradeCode || UUID.v5(this.packager.appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase()
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const artifactName = packager.expandArtifactBeautyNamePattern(this.options, "msi", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "MSI",
      file: artifactPath,
      arch,
    })

    const stageDir = await createStageDir(this, packager, arch)
    const vm = this.vm

    const commonOptions = getEffectiveOptions(this.options, this.packager)

    // wix 4.0.0.5512.2 doesn't support the arm64 architecture so default to x64 when building for arm64.
    // This will result in an x64 MSI installer that installs an arm64 version of the application. This is a
    // stopgap until the electron-builder-binaries wix version is upgraded to a version that supports arm64:
    // https://github.com/electron-userland/electron-builder/issues/6077
    const wixArch = arch == Arch.arm64 ? Arch.x64 : arch

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFiles = ["project.wixobj"]
    await writeFile(projectFile, await this.writeManifest(appOutDir, wixArch, commonOptions))

    await packager.info.emitMsiProjectCreated(projectFile)

    // noinspection SpellCheckingInspection
    const vendorPath = await getBinFromUrl("wix", "4.0.0.5512.2", "/X5poahdCc3199Vt6AP7gluTlT1nxi9cbbHhZhCMEu+ngyP1LiBMn+oZX7QAZVaKeBMc2SjVp7fJqNLqsUnPNQ==")

    // noinspection SpellCheckingInspection
    const candleArgs = ["-arch", wixArch === Arch.ia32 ? "x86" : "x64", `-dappDir=${vm.toVmFile(appOutDir)}`].concat(this.getCommonWixArgs())
    candleArgs.push("project.wxs")
    await vm.exec(vm.toVmFile(path.join(vendorPath, "candle.exe")), candleArgs, {
      cwd: stageDir.dir,
    })

    await this.light(objectFiles, vm, artifactPath, appOutDir, vendorPath, stageDir.dir)

    await stageDir.cleanup()

    await packager.sign(artifactPath)

    await packager.info.emitArtifactBuildCompleted({
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
      "-out",
      vm.toVmFile(artifactPath),
      "-v",
      // https://github.com/wixtoolset/issues/issues/5169
      "-spdb",
      // https://sourceforge.net/p/wix/bugs/2405/
      // error LGHT1076 : ICE61: This product should remove only older versions of itself. The Maximum version is not less than the current product. (1.1.0.42 1.1.0.42)
      "-sw1076",
      `-dappDir=${vm.toVmFile(appOutDir)}`,
      // "-dcl:high",
    ]
      .concat(this.getCommonWixArgs())
      .concat(this.getAdditionalLightArgs())

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

  private getAdditionalLightArgs() {
    const args: Array<string> = []
    if (this.options.additionalLightArgs != null) {
      args.push(...this.options.additionalLightArgs)
    }
    return args
  }

  private getCommonWixArgs() {
    const args: Array<string> = ["-pedantic"]
    if (this.options.warningsAsErrors !== false) {
      args.push("-wx")
    }
    if (this.options.additionalWixArgs != null) {
      args.push(...this.options.additionalWixArgs)
    }
    return args
  }

  protected async writeManifest(appOutDir: string, wixArch: Arch, commonOptions: FinalCommonWindowsInstallerOptions) {
    const appInfo = this.packager.appInfo
    const { files, dirs } = await this.computeFileDeclaration(appOutDir)
    const options = this.options

    return (await this.projectTemplate.value)({
      ...(await this.getBaseOptions(commonOptions)),
      isCreateDesktopShortcut: commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER,
      isRunAfterFinish: options.runAfterFinish !== false,
      // https://stackoverflow.com/questions/1929038/compilation-error-ice80-the-64bitcomponent-uses-32bitdirectory
      programFilesId: wixArch === Arch.x64 ? "ProgramFiles64Folder" : "ProgramFilesFolder",
      // wix in the name because special wix format can be used in the name
      installationDirectoryWixName: getWindowsInstallationDirName(appInfo, commonOptions.isAssisted || commonOptions.isPerMachine === true),
      dirs,
      files,
    })
  }

  protected async getBaseOptions(commonOptions: FinalCommonWindowsInstallerOptions): Promise<any> {
    const appInfo = this.packager.appInfo
    const iconPath = await this.packager.getIconPath()
    const compression = this.packager.compression

    const companyName = appInfo.companyName
    if (!companyName) {
      log.warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
    }

    return {
      ...commonOptions,
      iconPath: iconPath == null ? null : this.vm.toVmFile(iconPath),
      iconId: this.iconId,
      compressionLevel: compression === "store" ? "none" : "high",
      version: appInfo.getVersionInWeirdWindowsForm(),
      productName: appInfo.productName,
      upgradeCode: this.upgradeCode,
      manufacturer: companyName || appInfo.productName,
      appDescription: appInfo.description,
    }
  }

  private async computeFileDeclaration(appOutDir: string) {
    const appInfo = this.packager.appInfo
    let isRootDirAddedToRemoveTable = false
    const dirNames = new Set<string>()
    const dirs: Array<string> = []
    const fileSpace = " ".repeat(6)
    const commonOptions = getEffectiveOptions(this.options, this.packager)
    const files = (await walk(appOutDir)).map(file => {
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
      } else if (!isRootDirAddedToRemoveTable) {
        isRootDirAddedToRemoveTable = true
      }

      // since RegistryValue can be part of Component, *** *** *** *** *** *** *** *** *** wix cannot auto generate guid
      // https://stackoverflow.com/questions/1405100/change-my-component-guid-in-wix
      let result = `<Component${directoryId === null ? "" : ` Directory="${directoryId}"`}>`
      result += `\n${fileSpace}  <File Name="${xmlAttr(fileName)}" Source="$(var.appDir)${path.sep}${xmlAttr(packagePath)}" ReadOnly="yes" KeyPath="yes"`
      const isMainExecutable = packagePath === `${appInfo.productFilename}.exe`
      if (isMainExecutable) {
        result += ' Id="mainExecutable"'
      } else if (directoryId === null) {
        result += ` Id="${path.basename(packagePath)}_f"`
      }

      const isCreateDesktopShortcut = commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER
      if (isMainExecutable && (isCreateDesktopShortcut || commonOptions.isCreateStartMenuShortcut)) {
        result += `>\n`
        const shortcutName = commonOptions.shortcutName
        if (isCreateDesktopShortcut) {
          result += `${fileSpace}  <Shortcut Id="desktopShortcut" Directory="DesktopFolder" Name="${xmlAttr(
            shortcutName
          )}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="${this.iconId}"/>\n`
        }

        const hasMenuCategory = commonOptions.menuCategory != null
        const startMenuShortcutDirectoryId = hasMenuCategory ? "AppProgramMenuDir" : "ProgramMenuFolder"
        if (commonOptions.isCreateStartMenuShortcut) {
          if (hasMenuCategory) {
            dirs.push(`<Directory Id="${startMenuShortcutDirectoryId}" Name="ProgramMenuFolder:\\${commonOptions.menuCategory}\\"/>`)
          }
          result += `${fileSpace}  <Shortcut Id="startMenuShortcut" Directory="${startMenuShortcutDirectoryId}" Name="${xmlAttr(
            shortcutName
          )}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes" Icon="${this.iconId}">\n`
          result += `${fileSpace}    <ShortcutProperty Key="System.AppUserModel.ID" Value="${xmlAttr(this.packager.appInfo.id)}"/>\n`
          result += `${fileSpace}  </Shortcut>\n`
        }
        result += `${fileSpace}</File>`

        if (hasMenuCategory) {
          result += `<RemoveFolder Id="${startMenuShortcutDirectoryId}" Directory="${startMenuShortcutDirectoryId}" On="uninstall"/>\n`
        }
      } else {
        result += `/>`
      }

      const fileAssociations = this.packager.fileAssociations
      if (isMainExecutable && fileAssociations.length !== 0) {
        for (const item of fileAssociations) {
          const extensions = asArray(item.ext).map(normalizeExt)
          for (const ext of extensions) {
            result += `${fileSpace}  <ProgId Id="${this.productMsiIdPrefix}.${ext}" Advertise="yes" Icon="${this.iconId}" ${
              item.description ? `Description="${item.description}"` : ""
            }>\n`
            result += `${fileSpace}    <Extension Id="${ext}" Advertise="yes">\n`
            result += `${fileSpace}      <Verb Id="open" Command="Open with ${xmlAttr(this.packager.appInfo.productName)}" Argument="&quot;%1&quot;"/>\n`
            result += `${fileSpace}    </Extension>\n`
            result += `${fileSpace}  </ProgId>\n`
          }
        }
      }

      return `${result}\n${fileSpace}</Component>`
    })

    return { dirs: listToString(dirs, 2), files: listToString(files, 3) }
  }
}

function listToString(list: Array<string>, indentLevel: number) {
  const space = " ".repeat(indentLevel * 2)
  return list.join(`\n${space}`)
}

function xmlAttr(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}
