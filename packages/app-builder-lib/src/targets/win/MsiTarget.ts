import { Arch, asArray, log, walk, escapeForXml } from "builder-util"
import { UUID } from "builder-util-runtime"
import { createHash } from "crypto"
import ejs from "ejs"
import { readFile, writeFile } from "fs/promises"
import { Lazy } from "lazy-val"
import path from "path"
import { Target } from "../../core.js"
import { MsiOptions } from "../../index.js"
import { DesktopShortcutCreationPolicy, FinalCommonWindowsInstallerOptions, getEffectiveOptions } from "../../options/CommonWindowsInstallerConfiguration.js"
import { normalizeExt } from "../../platformPackager.js"
import { assertNoWix4Namespaces, getCandleArch, getWixArch, getWixNamespace, getWixToolset, WixToolset } from "../../toolsets/wix.js"
import { getTemplatePath } from "../../util/pathManager.js"
import { withToolsetLock } from "../../util/toolsetLock.js"
import { VmManager } from "../../vm/vm.js"
import { WineVmManager } from "../../vm/WineVm.js"
import { WinPackager } from "../../winPackager.js"
import { createStageDir, getWindowsInstallationDirName } from "../targetUtil.js"

const ELECTRON_BUILDER_UPGRADE_CODE_NS_UUID = UUID.parse("d752fe43-5d44-44d5-9fc9-6dd1bf19d5cc")
const ROOT_DIR_ID = "APPLICATIONFOLDER"

// candle.exe and light.exe are .NET Framework programs: on macOS and Linux they run under Wine, which runs them with wine-mono (the
// toolsets.wix notes in toolsets.md), not with a host Mono
export default class MsiTarget extends Target {
  protected readonly vm = process.platform === "win32" ? new VmManager() : new WineVmManager(this.packager.config.toolsets?.wine, this.packager.buildResourcesDir)

  readonly options: MsiOptions = this.packager.getOptionsForTarget<MsiOptions>("msi")

  constructor(
    protected readonly packager: WinPackager,
    readonly outDir: string,
    name = "msi",
    isAsyncSupported = true
  ) {
    super(name, isAsyncSupported)
  }

  // `toolsets.wix` decides the .wxs namespace (getBaseOptions) and whether arm64 is supported, so it is resolved before the project is written
  protected readonly wixToolset = new Lazy<WixToolset>(() => getWixToolset(this.packager.config.toolsets?.wix, this.packager.buildResourcesDir))

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
    await packager.emitArtifactBuildStarted({
      targetPresentableName: "MSI",
      file: artifactPath,
      arch,
    })

    const stageDir = await createStageDir(this, packager, arch)
    const vm = this.vm

    const commonOptions = getEffectiveOptions(this.options, this.packager)

    // The legacy wix 4.0.0.5512.2 bundle (`toolsets.wix: "0.0.0"`) doesn't support the arm64 architecture, so with it an arm64 build is
    // packaged as an x64 MSI that installs the arm64 app. The default WiX 3.14.1 bundle builds an arm64 MSI.
    // https://github.com/electron-userland/electron-builder/issues/6077
    const wixToolset = await this.wixToolset.value
    const wixArch = getWixArch(arch, wixToolset.schema)

    const projectFile = stageDir.getTempFile("project.wxs")
    const objectFiles = ["project.wixobj"]
    await writeFile(projectFile, await this.writeManifest(appOutDir, wixArch, commonOptions))

    await packager.emitMsiProjectCreated(projectFile)
    // an msiProjectCreated hook written for the legacy bundle can add WiX 4 namespaces, which WiX 3 can't compile
    assertNoWix4Namespaces(await readFile(projectFile, "utf8"), wixToolset.schema)

    const vendorPath = wixToolset.path

    // noinspection SpellCheckingInspection
    const candleArgs = ["-arch", getCandleArch(wixArch), `-dappDir=${vm.toVmFile(appOutDir)}`].concat(this.getCommonWixArgs())
    candleArgs.push("project.wxs")
    await withToolsetLock(async () => {
      await vm.exec(vm.toVmFile(path.join(vendorPath, "candle.exe")), candleArgs, {
        cwd: stageDir.dir,
      })
      await this.light(objectFiles, vm, artifactPath, appOutDir, vendorPath, stageDir.dir)
    })

    await stageDir.cleanup()

    await packager.signIf(artifactPath)

    await packager.emitArtifactBuildCompleted({
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
    const isWix3 = (await this.wixToolset.value).schema === "v3"

    return (await this.projectTemplate.value)({
      ...(await this.getBaseOptions(commonOptions)),
      isCreateDesktopShortcut: commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER,
      isRunAfterFinish: options.runAfterFinish !== false,
      // https://stackoverflow.com/questions/1929038/compilation-error-ice80-the-64bitcomponent-uses-32bitdirectory
      programFilesId: wixArch === Arch.ia32 ? "ProgramFilesFolder" : "ProgramFiles64Folder",
      // a WiX 3 component can't override the directory of its ComponentGroup, so there each component names its own (computeFileDeclaration)
      componentGroupDirectoryAttribute: isWix3 ? "" : ` Directory="${ROOT_DIR_ID}"`,
      // the directories between the Program Files folder and APPLICATIONFOLDER, outermost first
      companyDirectories: getCompanyDirectories(commonOptions.menuCategory, isWix3),
      // wix in the name because special wix format can be used in the name
      installationDirectoryWixName: getWindowsInstallationDirName(appInfo, commonOptions.isAssisted || commonOptions.isPerMachine === true),
      dirs,
      files,
    })
  }

  protected async getBaseOptions(commonOptions: FinalCommonWindowsInstallerOptions): Promise<any> {
    const wixSchema = (await this.wixToolset.value).schema
    const appInfo = this.packager.appInfo
    const iconPath = await this.packager.getIconPath()
    const compression = this.packager.compression

    const companyName = appInfo.companyName
    if (!companyName) {
      log.warn(`Manufacturer is not set for MSI — please set "author" in the package.json`)
    }

    return {
      ...commonOptions,
      wixNamespace: getWixNamespace(wixSchema),
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
    // WiX 3 has no inline directory syntax, and a component can't override the directory of its ComponentGroup there
    const isWix3 = (await this.wixToolset.value).schema === "v3"
    let isRootDirAddedToRemoveTable = false
    const dirNames = new Set<string>()
    const dirs: Array<string> = []
    // assigned in the map callback below, which control-flow narrowing does not see
    let startMenuCategory = null as string | null
    const fileSpace = " ".repeat(6)
    const commonOptions = getEffectiveOptions(this.options, this.packager)
    // WiX 3 declares one Directory per segment, so empty segments (a leading, trailing or doubled separator) are dropped
    const menuCategory = isWix3 ? joinMenuCategory(commonOptions.menuCategory, path.sep) : commonOptions.menuCategory
    // The template only declares `<Icon Id="${iconId}"/>` when an icon is configured, so referencing
    // that id unconditionally makes light.exe fail with LGHT0094 for an app without an icon.
    const iconAttribute = (await this.packager.getIconPath()) == null ? "" : ` Icon="${this.iconId}"`
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
        directoryId = getDirectoryId(dirName)
        if (!dirNames.has(dirName)) {
          dirNames.add(dirName)
          if (!isWix3) {
            dirs.push(`<Directory Id="${directoryId}" Name="${ROOT_DIR_ID}:\\${dirName.replace(/\//g, "\\")}\\"/>`)
          }
        }
      } else if (!isRootDirAddedToRemoveTable) {
        isRootDirAddedToRemoveTable = true
      }

      // since RegistryValue can be part of Component, *** *** *** *** *** *** *** *** *** wix cannot auto generate guid
      // https://stackoverflow.com/questions/1405100/change-my-component-guid-in-wix
      const componentDirectoryId = directoryId ?? (isWix3 ? ROOT_DIR_ID : null)
      let result = `<Component${componentDirectoryId === null ? "" : ` Directory="${componentDirectoryId}"`}>`
      result += `\n${fileSpace}  <File Name="${escapeForXml(fileName)}" Source="$(var.appDir)${path.sep}${escapeForXml(packagePath)}" ReadOnly="yes" KeyPath="yes"`
      const isMainExecutable = packagePath === `${appInfo.productFilename}.exe`
      if (isMainExecutable) {
        result += ' Id="mainExecutable"'
      } else if (directoryId === null) {
        result += ` Id="${getRootFileId(packagePath, isWix3)}"`
      } else if (isWix3) {
        // WiX 3 derives an omitted File/@Id (and so the Component/@Id) from the file name alone, which collides for files of the same
        // name in different directories (LGHT0091). The component GUID is derived from the install path, not from this id.
        result += ` Id="${getHashedFileId(packagePath)}"`
      }

      const isCreateDesktopShortcut = commonOptions.isCreateDesktopShortcut !== DesktopShortcutCreationPolicy.NEVER
      if (isMainExecutable && (isCreateDesktopShortcut || commonOptions.isCreateStartMenuShortcut)) {
        result += `>\n`
        const shortcutName = commonOptions.shortcutName
        if (isCreateDesktopShortcut) {
          result += `${fileSpace}  <Shortcut Id="desktopShortcut" Directory="DesktopFolder" Name="${escapeForXml(
            shortcutName
          )}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes"${iconAttribute}/>\n`
        }

        const hasMenuCategory = menuCategory != null
        const startMenuShortcutDirectoryId = hasMenuCategory ? "AppProgramMenuDir" : "ProgramMenuFolder"
        if (commonOptions.isCreateStartMenuShortcut) {
          if (menuCategory != null) {
            if (!isWix3) {
              dirs.push(`<Directory Id="${startMenuShortcutDirectoryId}" Name="ProgramMenuFolder:\\${menuCategory}\\"/>`)
            } else {
              startMenuCategory = menuCategory
            }
          }
          result += `${fileSpace}  <Shortcut Id="startMenuShortcut" Directory="${startMenuShortcutDirectoryId}" Name="${escapeForXml(
            shortcutName
          )}" WorkingDirectory="APPLICATIONFOLDER" Advertise="yes"${iconAttribute}>\n`
          result += `${fileSpace}    <ShortcutProperty Key="System.AppUserModel.ID" Value="${escapeForXml(this.packager.appInfo.id)}"/>\n`
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
            result += `${fileSpace}  <ProgId Id="${this.productMsiIdPrefix}.${escapeForXml(ext)}" Advertise="yes"${iconAttribute} ${
              item.description ? `Description="${escapeForXml(item.description)}"` : ""
            }>\n`
            result += `${fileSpace}    <Extension Id="${escapeForXml(ext)}" Advertise="yes">\n`
            result += `${fileSpace}      <Verb Id="open" Command="Open with ${escapeForXml(this.packager.appInfo.productName)}" Argument="&quot;%1&quot;"/>\n`
            result += `${fileSpace}    </Extension>\n`
            result += `${fileSpace}  </ProgId>\n`
          }
        }
      }

      return `${result}\n${fileSpace}</Component>`
    })

    if (isWix3) {
      dirs.push(...renderDirectoryTree(ROOT_DIR_ID, dirNames, path.sep, getDirectoryId))
      if (startMenuCategory != null) {
        // the shortcut is in the innermost directory of the category, which keeps the id the shortcut and RemoveFolder use
        const categoryPath = startMenuCategory
        dirs.push(...renderDirectoryTree("ProgramMenuFolder", [categoryPath], path.sep, it => (it === categoryPath ? "AppProgramMenuDir" : getDirectoryId(`menu:${it}`))))
      }
    }

    return { dirs: listToString(dirs, 2), files: listToString(files, 3) }
  }
}

/** The non-empty segments of a `menuCategory` ("A/B", "A\\B"); a leading, trailing or doubled separator gives no segment. */
function getMenuCategorySegments(menuCategory: string | null): Array<string> {
  return menuCategory == null ? [] : menuCategory.split(/[\\/]+/).filter(it => it.length > 0)
}

/** WiX 3: `menuCategory` with its non-empty segments joined with `separator`, or null if it has none. */
function joinMenuCategory(menuCategory: string | null, separator: string): string | null {
  const segments = getMenuCategorySegments(menuCategory)
  return segments.length === 0 ? null : segments.join(separator)
}

/**
 * The `Directory` elements that wrap APPLICATIONFOLDER under the Program Files folder for `menuCategory`, outermost first; the
 * innermost is `COMPANYDIR`. The legacy bundle takes the category as one name (its inline directory syntax splits it); WiX 3
 * has no inline syntax, so there each segment is a nested directory.
 */
function getCompanyDirectories(menuCategory: string | null, isWix3: boolean): Array<{ id: string; name: string }> {
  if (!isWix3) {
    return menuCategory ? [{ id: "COMPANYDIR", name: menuCategory }] : []
  }
  const segments = getMenuCategorySegments(menuCategory)
  return segments.map((name, index) => ({
    id: index === segments.length - 1 ? "COMPANYDIR" : getDirectoryId(`company:${segments.slice(0, index + 1).join("/")}`),
    name,
  }))
}

// what WiX 3 candle accepts as an identifier (CNDL0014), and its length limit (CNDL1026, an error with -wx)
const WIX3_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*$/
const WIX3_IDENTIFIER_MAX_LENGTH = 72

function getHashedFileId(packagePath: string): string {
  return "f" + createHash("sha256").update(packagePath).digest("hex").slice(0, 16)
}

/**
 * The `File/@Id` of a file at the root of the app dir: the file name with `_f`. WiX 3 rejects an id with other characters than
 * letters, digits, `_` and `.` (Electron ships `vulkan-1.dll`), or longer than 72 characters, so such a file gets an id derived
 * from its name there, like the files in subdirectories. The legacy bundle accepts these ids. File names in the app dir are not
 * trusted input, so the id is XML-escaped like the name.
 */
function getRootFileId(packagePath: string, isWix3: boolean): string {
  const id = `${path.basename(packagePath)}_f`
  if (isWix3 && (!WIX3_IDENTIFIER.test(id) || id.length > WIX3_IDENTIFIER_MAX_LENGTH)) {
    return getHashedFileId(packagePath)
  }
  return escapeForXml(id)
}

function getDirectoryId(dirName: string): string {
  return "d" + createHash("sha256").update(dirName).digest("hex").slice(0, 16)
}

/**
 * WiX 3 has no inline directory syntax (`Name="ROOT:\a\b\"`), so each directory, and each of its ancestors, is declared as a
 * nested `Directory` under a `DirectoryRef` to `rootId`. `dirNames` are relative paths joined with `separator`.
 */
export function renderDirectoryTree(rootId: string, dirNames: Iterable<string>, separator: string, idOf: (dirName: string) => string): Array<string> {
  interface Node {
    readonly path: string
    readonly children: Map<string, Node>
  }
  const root: Node = { path: "", children: new Map() }
  for (const dirName of dirNames) {
    let node = root
    for (const segment of dirName.split(separator)) {
      let child = node.children.get(segment)
      if (child == null) {
        child = { path: node.path === "" ? segment : `${node.path}${separator}${segment}`, children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
  }
  if (root.children.size === 0) {
    return []
  }
  const lines = [`<DirectoryRef Id="${rootId}">`]
  const render = (node: Node, depth: number): void => {
    const indent = "  ".repeat(depth)
    for (const [name, child] of node.children) {
      const open = `${indent}<Directory Id="${idOf(child.path)}" Name="${escapeForXml(name)}"`
      if (child.children.size === 0) {
        lines.push(`${open}/>`)
      } else {
        lines.push(`${open}>`)
        render(child, depth + 1)
        lines.push(`${indent}</Directory>`)
      }
    }
  }
  render(root, 1)
  lines.push("</DirectoryRef>")
  return lines
}

function listToString(list: Array<string>, indentLevel: number) {
  const space = " ".repeat(indentLevel * 2)
  return list.join(`\n${space}`)
}
