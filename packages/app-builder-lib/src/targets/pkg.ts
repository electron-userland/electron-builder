import { Arch, debug, exec, statOrNull, use } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { readdirSync } from "fs"
import { readFile, unlink, writeFile } from "fs/promises"
import * as path from "path"
import { filterCFBundleIdentifier } from "../appInfo"
import { findIdentity, Identity } from "../codeSign/macCodeSign"
import { Target } from "../core"
import { MacPackager } from "../macPackager"
import { PkgOptions } from "../options/pkgOptions"
import { executeAppBuilderAndWriteJson, executeAppBuilderAsJson } from "../util/appBuilder"
import { getNotLocalizedLicenseFile } from "../util/license"

const certType = "Developer ID Installer"

type ExtraPackages = {
  packagePath: string
  packages: string[]
}

// http://www.shanekirk.com/2013/10/creating-flat-packages-in-osx/
// to use --scripts, we must build .app bundle separately using pkgbuild
// productbuild --scripts doesn't work (because scripts in this case not added to our package)
// https://github.com/electron-userland/@electron/osx-sign/issues/96#issuecomment-274986942
export class PkgTarget extends Target {
  readonly options: PkgOptions = {
    allowAnywhere: true,
    allowCurrentUserHome: true,
    allowRootDirectory: true,
    ...this.packager.config.pkg,
  }

  constructor(
    private readonly packager: MacPackager,
    readonly outDir: string
  ) {
    super("pkg")
  }

  async build(appPath: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    const appInfo = packager.appInfo

    // pkg doesn't like not ASCII symbols (Could not open package to list files: /Volumes/test/t-gIjdGK/test-project-0/dist/Test App ßW-1.1.0.pkg)
    const artifactName = packager.expandArtifactNamePattern(options, "pkg", arch)
    const artifactPath = path.join(this.outDir, artifactName)

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "pkg",
      file: artifactPath,
      arch,
    })

    const keychainFile = (await packager.codeSigningInfo.value).keychainFile

    const appOutDir = this.outDir
    // https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html
    const distInfoFile = path.join(appOutDir, "distribution.xml")

    const extraPackages = this.getExtraPackages()

    const innerPackageFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.pkg`)
    const componentPropertyListFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.plist`)
    const identity = (
      await Promise.all([
        findIdentity(certType, options.identity || packager.platformSpecificBuildOptions.identity, keychainFile),
        this.customizeDistributionConfiguration(distInfoFile, appPath, extraPackages),
        this.buildComponentPackage(appPath, componentPropertyListFile, innerPackageFile),
      ])
    )[0]

    if (identity == null && packager.forceCodeSigning) {
      throw new Error(`Cannot find valid "${certType}" to sign standalone installer, please see https://electron.build/code-signing`)
    }

    const args = prepareProductBuildArgs(identity, keychainFile)
    args.push("--distribution", distInfoFile)
    if (extraPackages) {
      args.push("--package-path", extraPackages.packagePath)
    }
    args.push(artifactPath)
    use(options.productbuild, it => args.push(...(it as any)))
    await exec("productbuild", args, {
      cwd: appOutDir,
    })
    await Promise.all([unlink(innerPackageFile), unlink(distInfoFile)])
    await packager.notarizeIfProvided(artifactPath)
    await packager.dispatchArtifactCreated(artifactPath, this, arch, packager.computeSafeArtifactName(artifactName, "pkg", arch))
  }

  private getExtraPackages(): ExtraPackages | null {
    const extraPkgsDir = this.options.extraPkgsDir
    if (extraPkgsDir == null) {
      return null
    }
    const packagePath = path.join(this.packager.info.buildResourcesDir, extraPkgsDir)
    let files: Array<string>
    try {
      files = readdirSync(packagePath)
    } catch (e: any) {
      if (e.code === "ENOENT") {
        return null
      } else {
        throw e
      }
    }
    const packages = files.filter(file => file.endsWith(".pkg"))
    if (packages.length === 0) {
      return null
    }
    return { packagePath, packages }
  }

  private async customizeDistributionConfiguration(distInfoFile: string, appPath: string, extraPackages: ExtraPackages | null) {
    const options = this.options
    const args = ["--synthesize", "--component", appPath]
    if (extraPackages) {
      extraPackages.packages.forEach(pkg => {
        args.push("--package", path.join(extraPackages.packagePath, pkg))
      })
    }
    args.push(distInfoFile)
    await exec("productbuild", args, {
      cwd: this.outDir,
    })

    let distInfo = await readFile(distInfoFile, "utf-8")

    if (options.mustClose != null && options.mustClose.length !== 0) {
      const startContent = `    <pkg-ref id="${this.packager.appInfo.id}">\n        <must-close>\n`
      const endContent = "        </must-close>\n    </pkg-ref>\n</installer-gui-script>"
      let mustCloseContent = ""
      options.mustClose.forEach(appId => {
        mustCloseContent += `            <app id="${appId}"/>\n`
      })
      distInfo = distInfo.replace("</installer-gui-script>", `${startContent}${mustCloseContent}${endContent}`)
    }

    const insertIndex = distInfo.lastIndexOf("</installer-gui-script>")
    distInfo =
      distInfo.substring(0, insertIndex) +
      `    <domains enable_anywhere="${options.allowAnywhere}" enable_currentUserHome="${options.allowCurrentUserHome}" enable_localSystem="${options.allowRootDirectory}" />\n` +
      distInfo.substring(insertIndex)

    if (options.background != null) {
      const background = await this.packager.getResource(options.background.file)
      if (background != null) {
        const alignment = options.background.alignment || "center"
        // noinspection SpellCheckingInspection
        const scaling = options.background.scaling || "tofit"
        distInfo = distInfo.substring(0, insertIndex) + `    <background file="${background}" alignment="${alignment}" scaling="${scaling}"/>\n` + distInfo.substring(insertIndex)
        distInfo =
          distInfo.substring(0, insertIndex) + `    <background-darkAqua file="${background}" alignment="${alignment}" scaling="${scaling}"/>\n` + distInfo.substring(insertIndex)
      }
    }

    const welcome = await this.packager.getResource(options.welcome)
    if (welcome != null) {
      distInfo = distInfo.substring(0, insertIndex) + `    <welcome file="${welcome}"/>\n` + distInfo.substring(insertIndex)
    }

    const license = await getNotLocalizedLicenseFile(options.license, this.packager)
    if (license != null) {
      distInfo = distInfo.substring(0, insertIndex) + `    <license file="${license}"/>\n` + distInfo.substring(insertIndex)
    }

    const conclusion = await this.packager.getResource(options.conclusion)
    if (conclusion != null) {
      distInfo = distInfo.substring(0, insertIndex) + `    <conclusion file="${conclusion}"/>\n` + distInfo.substring(insertIndex)
    }

    debug(distInfo)
    await writeFile(distInfoFile, distInfo)
  }

  private async buildComponentPackage(appPath: string, propertyListOutputFile: string, packageOutputFile: string) {
    const options = this.options
    const rootPath = path.dirname(appPath)

    // first produce a component plist template
    await exec("pkgbuild", ["--analyze", "--root", rootPath, propertyListOutputFile])

    // process the template plist
    const plistInfo = (await executeAppBuilderAsJson<Array<any>>(["decode-plist", "-f", propertyListOutputFile]))[0].filter(
      (it: any) => it.RootRelativeBundlePath !== "Electron.dSYM"
    )
    let packageInfo: any = {}
    if (plistInfo.length > 0) {
      packageInfo = plistInfo[0]

      // ChildBundles lists all of electron binaries within the .app.
      // There is no particular reason for removing that key, except to be as close as possible to
      // the PackageInfo generated by previous versions of electron-builder.
      delete packageInfo.ChildBundles

      if (options.isRelocatable != null) {
        packageInfo.BundleIsRelocatable = options.isRelocatable
      }

      if (options.isVersionChecked != null) {
        packageInfo.BundleIsVersionChecked = options.isVersionChecked
      }

      if (options.hasStrictIdentifier != null) {
        packageInfo.BundleHasStrictIdentifier = options.hasStrictIdentifier
      }

      if (options.overwriteAction != null) {
        packageInfo.BundleOverwriteAction = options.overwriteAction
      }
    }

    // now build the package
    const args = ["--root", rootPath, "--identifier", this.packager.appInfo.id, "--component-plist", propertyListOutputFile]

    use(this.options.installLocation || "/Applications", it => args.push("--install-location", it))

    // nasty nested ternary-statement, probably should optimize
    const scriptsDir =
      // user-provided scripts dir
      options.scripts != null
        ? path.resolve(this.packager.info.buildResourcesDir, options.scripts)
        : // fallback to default unless user explicitly sets null
          options.scripts !== null
          ? path.join(this.packager.info.buildResourcesDir, "pkg-scripts")
          : null
    if (scriptsDir && (await statOrNull(scriptsDir))?.isDirectory()) {
      const dirContents = readdirSync(scriptsDir)
      dirContents.forEach(name => {
        if (name.includes("preinstall")) {
          packageInfo.BundlePreInstallScriptPath = name
        } else if (name.includes("postinstall")) {
          packageInfo.BundlePostInstallScriptPath = name
        }
      })
      args.push("--scripts", scriptsDir)
    }
    if (plistInfo.length > 0) {
      await executeAppBuilderAndWriteJson(["encode-plist"], { [propertyListOutputFile]: plistInfo })
    }

    args.push(packageOutputFile)

    await exec("pkgbuild", args)
  }
}

export function prepareProductBuildArgs(identity: Identity | null, keychain: string | Nullish): Array<string> {
  const args: Array<string> = []
  if (identity != null) {
    args.push("--sign", identity.hash!)
    if (keychain != null) {
      args.push("--keychain", keychain)
    }
  }
  return args
}
