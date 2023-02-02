import { Arch, log, deepAssign } from "builder-util"
import { UUID } from "builder-util-runtime"
import { getBinFromUrl } from "../binDownload"
import * as ejs from "ejs"
import { readFile, writeFile } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import { MsiWrappedOptions } from "../"
import { Target, TargetConfiguration } from "../core"
import { FinalCommonWindowsInstallerOptions, getEffectiveOptions } from "../options/CommonWindowsInstallerConfiguration"
import { getTemplatePath } from "../util/pathManager"
import { VmManager } from "../vm/vm"
import { WineVmManager } from "../vm/WineVm"
import { WinPackager } from "../winPackager"
import { createStageDir } from "./targetUtil"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("44a7d685-ff0b-4877-b761-5dc194e7f071")
const ELECTRON_MSI_WRAPPED_NS_UUID = UUID.parse("467f7bb2-a83c-442f-b776-394d316e8e53")
// const ROOT_DIR_ID = "APPLICATIONFOLDER"

const projectTemplate = new Lazy<(data: any) => string>(async () => {
  const template = (await readFile(path.join(getTemplatePath("msiWrapped"), "template.xml"), "utf8"))
    .replace(/{{/g, "<%")
    .replace(/}}/g, "%>")
    .replace(/\${([^}]+)}/g, "<%=$1%>")
  return ejs.compile(template)
})

// WiX doesn't support Mono, so, dontnet462 is required to be installed for wine (preinstalled in our bundled wine)
export default class MsiWrappedTarget extends Target {
  private readonly vm = process.platform === "win32" ? new VmManager() : new WineVmManager()

  readonly options: MsiWrappedOptions = deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msiWrapped)

  /** @private */
  private readonly archs: Map<Arch, string> = new Map()

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    // must be synchronous so it can run after nsis
    super("msiWrapped", false)
  }

  /**
   * A product-specific string that can be used in an [MSI Identifier](https://docs.microsoft.com/en-us/windows/win32/msi/identifier).
   */
  private get productMsiIdPrefix() {
    const sanitizedId = this.packager.appInfo.productFilename.replace(/[^\w.]/g, "").replace(/^[^A-Za-z_]+/, "")
    return sanitizedId.length > 0 ? sanitizedId : "App" + this.upgradeCode.replace(/-/g, "")
  }

  private get iconId() {
    return `${this.productMsiIdPrefix}Icon.exe`
  }

  private get upgradeCode(): string {
    return (this.options.upgradeCode || UUID.v5(this.packager.appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase()
  }

  private get productId(): string {
    // this id is only required to build the installer
    // however it serves no purpose as this msi is just
    // a wrapper for an exe
    return UUID.v5(this.packager.appInfo.id, ELECTRON_MSI_WRAPPED_NS_UUID).toUpperCase()
  }

  private validatePrerequisites(): void {
    const config = this.packager.config
    // this target requires nsis to be configured and executed
    // as this build re-bundles the nsis executable and wraps it in an msi

    if (!config.win || !config.win.target || !Array.isArray(config.win.target)) {
      throw new Error("No windows target found!")
    }

    const target = config.win.target
    const nsisTarget = "nsis"
    if (!target.some((t: TargetConfiguration | string) => (typeof t === "string" && t === nsisTarget) || (t as TargetConfiguration).target === nsisTarget)) {
      throw new Error("No nsis target found! Please specify an nsis target")
    }
  }

  build(appOutDir: string, arch: Arch) {
    this.archs.set(arch, appOutDir)
    return Promise.resolve()
  }

  async finishBuild(): Promise<any> {
    const packager = this.packager

    this.validatePrerequisites()

    const [arch, appOutDir] = this.archs.entries().next().value
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

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFiles = ["project.wixobj"]
    await writeFile(projectFile, await this.writeManifest(/*appOutDir,*/ arch, commonOptions))

    await packager.info.callMsiProjectCreated(projectFile)

    // noinspection SpellCheckingInspection
    const vendorPath = await getBinFromUrl("wix", "4.0.0.5512.2", "/X5poahdCc3199Vt6AP7gluTlT1nxi9cbbHhZhCMEu+ngyP1LiBMn+oZX7QAZVaKeBMc2SjVp7fJqNLqsUnPNQ==")

    // noinspection SpellCheckingInspection
    const candleArgs = ["-arch", arch === Arch.ia32 ? "x86" : arch === Arch.arm64 ? "arm64" : "x64", `-dappDir=${vm.toVmFile(appOutDir)}`].concat(this.getCommonWixArgs())
    candleArgs.push("project.wxs")
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
    if (this.options.additionalWixArgs != null) {
      args.push(...this.options.additionalWixArgs)
    }
    return args
  }

  protected get installerFilenamePattern(): string {
    // big assumption is made here for the moment that the pattern didn't change
    // tslint:disable:no-invalid-template-strings
    return "${productName} Setup ${version}.${ext}"
  }

  private getExeSourcePath(arch: Arch) {
    const packager = this.packager
    // in this case, we want .exe, this way we can wrap the existing package if it exists
    // const artifactName = packager.expandArtifactBeautyNamePattern(this.options, "exe", arch)
    const artifactName = packager.expandArtifactNamePattern(this.options, "exe", arch, this.installerFilenamePattern, false, this.packager.platformSpecificBuildOptions.defaultArch)
    const artifactPath = path.join(this.outDir, artifactName)

    return artifactPath
  }

  private async writeManifest(/*appOutDir: string,*/ arch: Arch, commonOptions: FinalCommonWindowsInstallerOptions) {
    const appInfo = this.packager.appInfo
    const exeSourcePath = this.getExeSourcePath(arch)
    // UUID.v5(this.packager.appInfo.id, ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID)).toUpperCase()
    // const { files, dirs } = await this.computeFileDeclaration(appOutDir)

    const companyName = appInfo.companyName
    if (!companyName) {
      log.warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
    }

    const compression = this.packager.compression
    // const options = this.options
    const iconPath = await this.packager.getIconPath()
    return (await projectTemplate.value)({
      ...commonOptions,
      iconPath: iconPath == null ? null : this.vm.toVmFile(iconPath),
      iconId: this.iconId,
      compressionLevel: compression === "store" ? "none" : "high",
      version: appInfo.getVersionInWeirdWindowsForm(),
      productName: appInfo.productName,
      upgradeCode: this.upgradeCode,
      manufacturer: companyName || appInfo.productName,
      appDescription: appInfo.description,
      exeSourcePath: exeSourcePath,
      productId: this.productId,
      impersonate: this.options.impersonate === true ? "yes" : "no",
      wrappedInstallerArgs: this.options.wrappedInstallerArgs,
    })
  }
}
