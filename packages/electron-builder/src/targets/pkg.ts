import { exec, use } from "electron-builder-util"
import MacPackager from "../macPackager"
import * as path from "path"
import { Target, Arch } from "electron-builder-core"
import { PkgOptions } from "../options/macOptions"
import { statOrNull } from "electron-builder-util/out/fs"
import { findIdentity } from "../codeSign"
import { filterCFBundleIdentifier } from "../packager/mac"
import { unlink } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"

// http://www.shanekirk.com/2013/10/creating-flat-packages-in-osx/
export class PkgTarget extends Target {
  private readonly options: PkgOptions = this.packager.config.pkg || Object.create(null)
  private readonly installLocation = this.options.installLocation || "/Applications"

  constructor(private packager: MacPackager) {
    super("pkg")
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    const appInfo = packager.appInfo

    const keychainName = (await packager.codeSigningInfo).keychainName
    const certType = "Developer ID Installer"
    const identity = await findIdentity(certType, options.identity || packager.platformSpecificBuildOptions.identity, keychainName)
    if (identity == null && packager.forceCodeSigning) {
      throw new Error(`Cannot find valid "${certType}" to sign standalone installer, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
    }

    const appPath = path.join(appOutDir, `${appInfo.productFilename}.app`)

    const distInfo = path.join(appOutDir, "distribution.xml")
    await exec("productbuild", ["--synthesize", "--component", appPath, this.installLocation, distInfo], {
      cwd: appOutDir,
    })

    // to use --scripts, we must build .app bundle separately using pkgbuild
    // productbuild --scripts doesn't work (because scripts in this case not added to our package)
    // https://github.com/electron-userland/electron-osx-sign/issues/96#issuecomment-274986942
    const innerPackageFile = path.join(appOutDir, `${filterCFBundleIdentifier(appInfo.id)}.pkg`)
    await this.buildComponentPackage(appPath, innerPackageFile)

    const outFile = path.join(appOutDir, packager.expandArtifactNamePattern(options, "pkg"))
    const args = prepareProductBuildArgs(identity, keychainName)
    args.push("--distribution", distInfo)
    args.push(outFile)

    use(options.productbuild, it => args.push(...<any>it))

    await exec("productbuild", args, {
      cwd: appOutDir,
    })
    await BluebirdPromise.all([unlink(innerPackageFile), unlink(distInfo)])

    packager.dispatchArtifactCreated(outFile, this, `${appInfo.name}-${appInfo.version}.pkg`)
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

export function prepareProductBuildArgs(identity: string | n, keychain: string | n) {
  const args = []
  if (identity != null) {
    args.push("--sign", identity)
    if (keychain != null) {
      args.push("--keychain", keychain)
    }
  }
  return args
}