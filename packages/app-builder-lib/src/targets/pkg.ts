import { Arch, debug, exec, use } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { getNotLocalizedLicenseFile } from "../util/license"
import { readFile, unlink, writeFile } from "fs-extra-p"
import * as path from "path"
import { build as buildPlist, parse as parsePlist } from "plist"
import { PkgOptions } from ".."
import { filterCFBundleIdentifier } from "../appInfo"
import { findIdentity, Identity } from "../codeSign/macCodeSign"
import { Target } from "../core"
import MacPackager from "../macPackager"

const certType = "Developer ID Installer"

// http://www.shanekirk.com/2013/10/creating-flat-packages-in-osx/
// to use --scripts, we must build .app bundle separately using pkgbuild
// productbuild --scripts doesn't work (because scripts in this case not added to our package)
// https://github.com/electron-userland/electron-osx-sign/issues/96#issuecomment-274986942
export class PkgTarget extends Target {
  readonly options: PkgOptions = {
    allowAnywhere: true,
    allowCurrentUserHome: true,
    allowRootDirectory: true,
    ...this.packager.config.pkg,
  }

  constructor(private readonly packager: MacPackager, readonly outDir: string) {
    super("pkg")
  }

  async build(appPath: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    const appInfo = packager.appInfo

    const artifactName = packager.expandArtifactNamePattern(options, "pkg")
    const artifactPath = path.join(this.outDir, artifactName)

    this.logBuilding("pkg", artifactPath, arch)

    const keychainName = (await packager.codeSigningInfo.value).keychainName

    const appOutDir = this.outDir
    // https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html
    const distInfoFile = path.join(appOutDir, "distribution.xml")

    const innerPackageFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.pkg`)
    const componentPropertyListFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.plist`)
    const identity = (await Promise.all([
      findIdentity(certType, options.identity || packager.platformSpecificBuildOptions.identity, keychainName),
      this.customizeDistributionConfiguration(distInfoFile, appPath),
      this.buildComponentPackage(appPath, componentPropertyListFile, innerPackageFile),
    ]))[0]

    if (identity == null && packager.forceCodeSigning) {
      throw new Error(`Cannot find valid "${certType}" to sign standalone installer, please see https://electron.build/code-signing`)
    }

    const args = prepareProductBuildArgs(identity, keychainName)
    args.push("--distribution", distInfoFile)
    args.push(artifactPath)
    use(options.productbuild, it => args.push(...it as any))
    await exec("productbuild", args, {
      cwd: appOutDir,
    })
    await Promise.all([unlink(innerPackageFile), unlink(distInfoFile)])

    packager.dispatchArtifactCreated(artifactPath, this, arch, packager.computeSafeArtifactName(artifactName, "pkg", arch))
  }

  private async customizeDistributionConfiguration(distInfoFile: string, appPath: string) {
    await exec("productbuild", ["--synthesize", "--component", appPath, distInfoFile], {
      cwd: this.outDir,
    })

    const options = this.options
    let distInfo = await readFile(distInfoFile, "utf-8")
    const insertIndex = distInfo.lastIndexOf("</installer-gui-script>")
    distInfo = distInfo.substring(0, insertIndex) + `    <domains enable_anywhere="${options.allowAnywhere}" enable_currentUserHome="${options.allowCurrentUserHome}" enable_localSystem="${options.allowRootDirectory}" />\n` + distInfo.substring(insertIndex)

    if (options.background != null) {
      const background = await this.packager.getResource(options.background.file)
      if (background != null) {
        const alignment = options.background.alignment || "center"
        // noinspection SpellCheckingInspection
        const scaling = options.background.scaling || "tofit"
        distInfo = distInfo.substring(0, insertIndex) + `    <background file="${background}" alignment="${alignment}" scaling="${scaling}"/>\n` + distInfo.substring(insertIndex)
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
    await exec("pkgbuild", [
      "--analyze",
      "--root", rootPath,
      propertyListOutputFile,
    ])

    // process the template plist
    const plistInfo = parsePlist(await readFile(propertyListOutputFile, "utf8"))
    if (plistInfo.length > 0) {
      const packageInfo = plistInfo[0]

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

      await writeFile(propertyListOutputFile, buildPlist(plistInfo))
    }

    // now build the package
    const args = [
      "--root", rootPath,
      "--component-plist", propertyListOutputFile,
    ]

    use(this.options.installLocation || "/Applications", it => args.push("--install-location", it!))
    if (options.scripts != null) {
      args.push("--scripts", path.resolve(this.packager.info.buildResourcesDir, options.scripts))
    }
    else if (options.scripts !== null) {
      const dir = path.join(this.packager.info.buildResourcesDir, "pkg-scripts")
      const stat = await statOrNull(dir)
      if (stat != null && stat.isDirectory()) {
        args.push("--scripts", dir)
      }
    }

    args.push(packageOutputFile)

    await exec("pkgbuild", args)
  }
}

export function prepareProductBuildArgs(identity: Identity | null, keychain: string | null | undefined): Array<string> {
  const args: Array<string> = []
  if (identity != null) {
    args.push("--sign", identity.hash)
    if (keychain != null) {
      args.push("--keychain", keychain)
    }
  }
  return args
}
