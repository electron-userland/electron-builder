import { Arch, AsyncTaskManager, exec, InvalidConfigurationError, isCanSignDmg, isEmptyOrSpaces, log, spawn, deepAssign, executeAppBuilder } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { copyDir, copyFile, exists, statOrNull } from "builder-util/out/fs"
import { addLicenseToDmg } from "./dmgLicense"
import { applyProperties, attachAndExecute, computeBackground, computeBackgroundColor, detach, transformBackgroundFileIfNeed } from "./dmgUtil"
import { stat } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { findIdentity, isSignAllowed } from "electron-builder-lib/out/codeSign"
import { Target, DmgOptions } from "electron-builder-lib"
import MacPackager from "electron-builder-lib/out/macPackager"
import { createBlockmap } from "electron-builder-lib/out/targets/differentialUpdateInfoBuilder"

export class DmgTarget extends Target {
  readonly options: DmgOptions = {
    differentialPackage: true,
    ...this.packager.config.dmg
  }

  constructor(private readonly packager: MacPackager, readonly outDir: string) {
    super("dmg")
  }

  async build(appPath: string, arch: Arch) {
    const packager = this.packager
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(packager.config.dmg, "dmg", null, "${productName}-" + (packager.platformSpecificBuildOptions.bundleShortVersion || "${version}") + ".${ext}")
    const artifactPath = path.join(this.outDir, artifactName)
    this.logBuilding("DMG", artifactPath, arch)

    const specification = await this.computeDmgOptions()
    const volumeName = sanitizeFileName(this.computeVolumeName(specification.title))

    const tempDmg = await createStageDmg(await packager.getTempFile(".dmg"), appPath, volumeName)

    // https://github.com/electron-userland/electron-builder/issues/2115
    const backgroundFile = specification.background == null ? null : await transformBackgroundFileIfNeed(specification.background, packager.info.tempDirManager)
    const finalSize = await computeAssetSize(packager.info.cancellationToken, tempDmg, specification, backgroundFile)
    await exec("hdiutil", ["resize", "-size", finalSize.toString(), tempDmg])

    const volumePath = path.join("/Volumes", volumeName)
    if (await exists(volumePath)) {
      log.debug({volumePath}, "unmounting previous disk image")
      await detach(volumePath)
    }

    if (!await attachAndExecute(tempDmg, true, () => customizeDmg(volumePath, specification, packager, backgroundFile))) {
      return
    }

    // dmg file must not exist otherwise hdiutil failed (https://github.com/electron-userland/electron-builder/issues/1308#issuecomment-282847594), so, -ov must be specified
    const args = ["convert", tempDmg, "-ov", "-format", specification.format!, "-o", artifactPath]
    if (specification.format === "UDZO") {
      args.push("-imagekey", `zlib-level=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9"}`)
    }
    await spawn("hdiutil", addLogLevel(args))
    if (this.options.internetEnabled) {
      await exec("hdiutil", addLogLevel(["internet-enable"]).concat(artifactPath))
    }

    const licenseData = await addLicenseToDmg(packager, artifactPath)
    if (packager.packagerOptions.effectiveOptionComputed != null) {
      await packager.packagerOptions.effectiveOptionComputed({licenseData})
    }

    if (packager.packagerOptions.effectiveOptionComputed != null) {
      await packager.packagerOptions.effectiveOptionComputed({artifactPath})
    }

    await this.signDmg(artifactPath)

    if (this.options.differentialPackage) {
      const safeArtifactName = packager.computeSafeArtifactName(artifactName, "dmg")
      const updateInfo = await createBlockmap(artifactPath, this, packager, safeArtifactName)
      packager.info.dispatchArtifactCreated({
        file: artifactPath,
        safeArtifactName,
        target: this,
        arch,
        packager,
        isWriteUpdateInfo: true,
        updateInfo,
      })
    }
  }

  private async signDmg(artifactPath: string) {
    if (!isSignAllowed(false)) {
      return
    }

    if (!(await isCanSignDmg())) {
      log.warn({solution: "please update OS"}, "at least macOS 10.11.5 is required to sign DMG")
    }

    const packager = this.packager
    const qualifier = packager.platformSpecificBuildOptions.identity
    // explicitly disabled if set to null
    if (qualifier === null) {
      // macPackager already somehow handle this situation, so, here just return
      return
    }

    const keychainName = (await packager.codeSigningInfo.value).keychainName
    const certificateType = "Developer ID Application"
    let identity = await findIdentity(certificateType, qualifier, keychainName)
    if (identity == null) {
      identity = await findIdentity("Mac Developer", qualifier, keychainName)
      if (identity == null) {
        return
      }
    }

    const args = ["--sign", identity.hash]
    if (keychainName != null) {
      args.push("--keychain", keychainName)
    }
    args.push(artifactPath)
    await exec("codesign", args)
  }

  computeVolumeName(custom?: string | null): string {
    const appInfo = this.packager.appInfo
    const shortVersion = this.packager.platformSpecificBuildOptions.bundleShortVersion || appInfo.version

    if (custom == null) {
      return `${appInfo.productFilename} ${shortVersion}`
    }

    return custom
      .replace(/\${shortVersion}/g, shortVersion)
      .replace(/\${version}/g, appInfo.version)
      .replace(/\${name}/g, appInfo.name)
      .replace(/\${productName}/g, appInfo.productName)
  }

  // public to test
  async computeDmgOptions(): Promise<DmgOptions> {
    // appdmg
    const appdmgWindow = (this.options.window as any) || {}
    const oldPosition = appdmgWindow.position
    const oldSize = appdmgWindow.size
    const oldIconSize = (this.options as any)["icon-size"]
    const oldBackgroundColor = (this.options as any)["background-color"]
    if (oldPosition != null) {
      log.warn({solution: "use dmg.window"}, "dmg.window.position is deprecated")
    }
    if (oldSize != null) {
      log.warn({solution: "use dmg.window"}, "dmg.window.size is deprecated")
    }
    if (oldIconSize != null) {
      log.warn({solution: "use dmg.iconSize"}, "dmg.icon-size is deprecated")
    }
    if (oldBackgroundColor != null) {
      log.warn({solution: "use dmg.backgroundColor"}, "dmg.background-color is deprecated")
    }

    const packager = this.packager
    const specification = deepAssign<DmgOptions>({
        window: {
          x: 400,
          y: 100,
        },
        iconSize: oldIconSize,
        backgroundColor: oldBackgroundColor,
        icon: "icon" in this.options ? undefined : await packager.getIconPath()
      },
      this.options,
      oldPosition == null ? null : {
        window: {
          x: oldPosition.x,
          y: oldPosition.y,
        }
      },
      oldSize == null ? null : {
        window: {
          width: oldSize.width,
          height: oldSize.height,
        }
      })

    if (specification.icon != null && isEmptyOrSpaces(specification.icon)) {
      throw new InvalidConfigurationError("dmg.icon cannot be specified as empty string")
    }

    const background = specification.background
    if (specification.backgroundColor != null) {
      if (background != null) {
        throw new InvalidConfigurationError("Both dmg.backgroundColor and dmg.background are specified — please set the only one")
      }
      specification.backgroundColor = computeBackgroundColor(specification.backgroundColor)
    }
    else if (background == null) {
      specification.background = await computeBackground(packager)
    }
    else {
      specification.background = path.resolve(packager.info.projectDir, background)
    }

    if (specification.format == null) {
      if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
        (specification as any).format = "UDZO"
      }
      else if (packager.compression === "store") {
        (specification as any).format = "UDRO"
      }
      else {
        (specification as any).format = packager.compression === "maximum" ? "UDBZ" : "UDZO"
      }
    }

    if (specification.contents == null) {
      specification.contents = [
        {
          x: 130, y: 220
        },
        {
          x: 410, y: 220, type: "link", path: "/Applications"
        }
      ]
    }
    return specification
  }
}

async function createStageDmg(tempDmg: string, appPath: string, volumeName: string) {
  //noinspection SpellCheckingInspection
  const imageArgs = addLogLevel(["create",
    "-srcfolder", appPath,
    "-volname", volumeName,
    "-anyowners", "-nospotlight",
    "-format", "UDRW",
  ])
  imageArgs.push("-fs", "HFS+", "-fsargs", "-c c=64,a=16,e=16")
  imageArgs.push(tempDmg)
  await spawn("hdiutil", imageArgs)
  return tempDmg
}

function addLogLevel(args: Array<string>): Array<string> {
  args.push(process.env.DEBUG_DMG === "true" ? "-verbose" : "-quiet")
  return args
}

async function computeAssetSize(cancellationToken: CancellationToken, dmgFile: string, specification: DmgOptions, backgroundFile: string | null | undefined) {
  const asyncTaskManager = new AsyncTaskManager(cancellationToken)
  asyncTaskManager.addTask(stat(dmgFile))

  if (specification.icon != null) {
    asyncTaskManager.addTask(statOrNull(specification.icon))
  }

  if (backgroundFile != null) {
    asyncTaskManager.addTask(stat(backgroundFile))
  }

  let result = 32 * 1024
  for (const stat of await asyncTaskManager.awaitTasks()) {
    if (stat != null) {
      result += stat.size
    }
  }
  return result
}

async function customizeDmg(volumePath: string, specification: DmgOptions, packager: MacPackager, backgroundFile: string | null | undefined) {
  const window = specification.window!
  const env: any = {
    ...process.env,
    volumePath,
    appFileName: `${packager.appInfo.productFilename}.app`,
    iconSize: specification.iconSize || 80,
    iconTextSize: specification.iconTextSize || 12,

    windowX: window.x,
    windowY: window.y,

    VERSIONER_PERL_PREFER_32_BIT: "true"
  }

  if (specification.backgroundColor != null || specification.background == null) {
    env.backgroundColor = specification.backgroundColor || "#ffffff"
    env.windowWidth = (window.width || 540).toString()
    env.windowHeight = (window.height || 380).toString()
  }
  else {
    delete env.backgroundColor

    if (window.width == null) {
      delete env.windowWidth
    }
    else {
      env.windowWidth = window.width.toString()
    }
    if (window.height == null) {
      delete env.windowHeight
    }
    else {
      env.windowHeight = window.height.toString()
    }
  }

  const args = ["dmg", "--volume", volumePath]
  if (specification.icon != null) {
    args.push("--icon", (await packager.getResource(specification.icon))!!)
  }
  if (backgroundFile != null) {
    env.backgroundFilename = path.basename(backgroundFile)
    args.push("--background", backgroundFile)
  }
  await executeAppBuilder(args)

  const asyncTaskManager = new AsyncTaskManager(packager.info.cancellationToken)
  await applyProperties(await computeDmgEntries(specification, volumePath, packager, asyncTaskManager), env, asyncTaskManager, packager)
  return packager.packagerOptions.effectiveOptionComputed == null || !(await packager.packagerOptions.effectiveOptionComputed({volumePath, specification, packager}))
}

async function computeDmgEntries(specification: DmgOptions, volumePath: string, packager: MacPackager, asyncTaskManager: AsyncTaskManager) {
  let result = ""
  for (const c of specification.contents!!) {
    if (c.path != null && c.path.endsWith(".app") && c.type !== "link") {
      log.warn({path: c.path, reason: "actual path to app will be used instead"}, `do not specify path for application`)
    }

    const entryPath = c.path || `${packager.appInfo.productFilename}.app`
    const entryName = c.name || path.basename(entryPath)
    result += `&makeEntries("${entryName}", Iloc_xy => [ ${c.x}, ${c.y} ]),\n`

    if (c.type === "link") {
      asyncTaskManager.addTask(exec("ln", ["-s", `/${entryPath.startsWith("/") ? entryPath.substring(1) : entryPath}`, `${volumePath}/${entryName}`]))
    }
    // use c.path instead of entryPath (to be sure that this logic is not applied to .app bundle) https://github.com/electron-userland/electron-builder/issues/2147
    else if (!isEmptyOrSpaces(c.path) && (c.type === "file" || c.type === "dir")) {
      const source = await packager.getResource(c.path)
      if (source == null) {
        log.warn({entryPath, reason: "doesn't exist"}, `skipped DMG item copying`)
        continue
      }

      const destination = `${volumePath}/${entryName}`
      asyncTaskManager.addTask(c.type === "dir" || (await stat(source)).isDirectory() ? copyDir(source, destination) : copyFile(source, destination))
    }
  }
  return result
}