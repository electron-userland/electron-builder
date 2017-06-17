import BluebirdPromise from "bluebird-lst"
import { debug, exec, use } from "electron-builder-util"
import { statOrNull } from "electron-builder-util/out/fs"
import { readFile, unlink, writeFile } from "fs-extra-p"
import * as path from "path"
import { findIdentity, Identity } from "../codeSign"
import { Arch, Target } from "../core"
import MacPackager from "../macPackager"
import { PkgOptions } from "../options/macOptions"
import { filterCFBundleIdentifier } from "../packager/mac"

// http://www.shanekirk.com/2013/10/creating-flat-packages-in-osx/
export class PkgTarget extends Target {
  readonly options: PkgOptions = Object.assign({
    allowAnywhere: true,
    allowCurrentUserHome: true,
    allowRootDirectory: true,
  }, this.packager.config.pkg)
  private readonly installLocation = this.options.installLocation || "/Applications"

  constructor(private readonly packager: MacPackager, readonly outDir: string) {
    super("pkg")
  }

  async build(appPath: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    const appInfo = packager.appInfo

    const keychainName = (await packager.codeSigningInfo).keychainName
    const certType = "Developer ID Installer"
    const identity = await findIdentity(certType, options.identity || packager.platformSpecificBuildOptions.identity, keychainName)
    if (identity == null && packager.forceCodeSigning) {
      throw new Error(`Cannot find valid "${certType}" to sign standalone installer, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
    }

    const appOutDir = this.outDir
    const distInfoFile = path.join(appOutDir, "distribution.xml")
    await exec("productbuild", ["--synthesize", "--component", appPath, this.installLocation, distInfoFile], {
      cwd: appOutDir,
    })

    let distInfo = await readFile(distInfoFile, "utf-8")
    const insertIndex = distInfo.lastIndexOf("</installer-gui-script>")
    distInfo = distInfo.substring(0, insertIndex) + `    <domains enable_anywhere="${options.allowAnywhere}" enable_currentUserHome="${options.allowCurrentUserHome}" enable_localSystem="${options.allowRootDirectory}" />\n` + distInfo.substring(insertIndex)
    await writeFile(distInfoFile, distInfo)

    debug(distInfo)

    // to use --scripts, we must build .app bundle separately using pkgbuild
    // productbuild --scripts doesn't work (because scripts in this case not added to our package)
    // https://github.com/electron-userland/electron-osx-sign/issues/96#issuecomment-274986942
    const innerPackageFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.pkg`)
    await this.buildComponentPackage(appPath, innerPackageFile)

    const outFile = path.join(appOutDir, packager.expandArtifactNamePattern(options, "pkg"))
    const args = prepareProductBuildArgs(identity, keychainName)
    args.push("--distribution", distInfoFile)
    args.push(outFile)

    use(options.productbuild, it => args.push(...<any>it))

    await exec("productbuild", args, {
      cwd: appOutDir,
    })
    await BluebirdPromise.all([unlink(innerPackageFile), unlink(distInfoFile)])

    packager.dispatchArtifactCreated(outFile, this, arch, `${appInfo.name}-${appInfo.version}.pkg`)
  }

  private async buildComponentPackage(appPath: string, outFile: string) {
    const options = this.options
    const args = [
      "--component", appPath,
      "--install-location", this.installLocation,
    ]
    if (options.scripts != null) {
      args.push("--scripts", path.resolve(this.packager.buildResourcesDir, options.scripts))
    }
    else if (options.scripts !== null) {
      const dir = path.join(this.packager.buildResourcesDir, "pkg-scripts")
      const stat = await statOrNull(dir)
      if (stat != null && stat.isDirectory()) {
        args.push("--scripts", dir)
      }
    }

    args.push(outFile)
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