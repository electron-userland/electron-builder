import BluebirdPromise from "bluebird-lst"
import { Arch, debug, exec, isEmptyOrSpaces, log, spawn, warn } from "electron-builder-util"
import { copyFile, exists, statOrNull } from "electron-builder-util/out/fs"
import { outputFile, readFile, remove, unlink } from "fs-extra-p"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import sanitizeFileName from "sanitize-filename"
import { DmgOptions, MacOptions } from "../../options/macOptions"
import { PlatformPackager } from "../../platformPackager"
import { addLicenseToDmg } from "./dmgLicense"
import { Target } from "../../core"
import { attachAndExecute, detach } from "./dmgUtil"
import { getTemplatePath, getVendorPath } from "../../util/pathManager"

export class DmgTarget extends Target {
  readonly options: DmgOptions = this.packager.config.dmg || Object.create(null)

  private helperDir = getTemplatePath("dmg")

  constructor(private readonly packager: PlatformPackager<MacOptions>, readonly outDir: string) {
    super("dmg")
  }

  async build(appPath: string, arch: Arch) {
    const packager = this.packager
    log("Building DMG")

    const specification = await this.computeDmgOptions()
    const volumeName = sanitizeFileName(this.computeVolumeName(specification.title))
    const artifactName = packager.expandArtifactNamePattern(packager.config.dmg, "dmg")
    const artifactPath = path.join(this.outDir, artifactName)

    const tempDmg = await packager.getTempFile(".dmg")
    const backgroundDir = path.join(await packager.getTempDir("dmg"), ".background")
    const backgroundFilename = specification.background == null ? null : path.basename(specification.background)
    if (backgroundFilename != null) {
      await copyFile(path.resolve(packager.info.projectDir, specification.background!), path.join(backgroundDir, backgroundFilename))
    }

    let preallocatedSize = 32 * 1024
    if (specification.icon != null) {
      const stat = await statOrNull(specification.icon)
      if (stat != null) {
        preallocatedSize += stat.size
      }
    }

    // allocate space for .DS_Store
    await outputFile(path.join(backgroundDir, "DSStorePlaceHolder"), new Buffer(preallocatedSize))

    //noinspection SpellCheckingInspection
    await spawn("hdiutil", addVerboseIfNeed(["create",
      "-srcfolder", backgroundDir,
      "-srcfolder", appPath,
      "-volname", volumeName,
      "-anyowners", "-nospotlight", "-fs", "HFS+", "-fsargs", "-c c=64,a=16,e=16",
      "-format", "UDRW",
    ]).concat(tempDmg))

    const volumePath = path.join("/Volumes", volumeName)
    if (await exists(volumePath)) {
      debug("Unmounting previous disk image")
      await detach(volumePath)
    }

    const isContinue = await attachAndExecute(tempDmg, true, async () => {
      const promises = [
        specification.background == null ? remove(`${volumePath}/.background`) : unlink(`${volumePath}/.background/DSStorePlaceHolder`),
      ]

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

      if (specification.icon == null) {
        delete env.volumeIcon
      }
      else {
        const volumeIcon = `${volumePath}/.VolumeIcon.icns`
        promises.push(copyFile((await packager.getResource(specification.icon))!, volumeIcon))
        env.volumeIcon = volumeIcon
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

        env.backgroundFilename = backgroundFilename as any
      }

      let entries = ""
      for (const c of specification.contents!!) {
        if (c.path != null && c.path.endsWith(".app") && c.type !== "link") {
          warn(`Do not specify path for application: "${c.path}". Actual path to app will be used instead.`)
        }

        let entryPath = c.path || `${packager.appInfo.productFilename}.app`
        if (entryPath.startsWith("/")) {
          entryPath = entryPath.substring(1)
        }

        const entryName = c.name || path.basename(entryPath)
        entries += `&makeEntries("${entryName}", Iloc_xy => [ ${c.x}, ${c.y} ]),\n`

        if (c.type === "link") {
          promises.push(exec("ln", ["-s", `/${entryPath}`, `${volumePath}/${entryName}`]))
        }
      }
      debug(entries)

      const dmgPropertiesFile = await packager.getTempFile("dmgProperties.pl")

      promises.push(outputFile(dmgPropertiesFile, (await readFile(path.join(this.helperDir, "dmgProperties.pl"), "utf-8")).replace("$ENTRIES", entries)))
      await BluebirdPromise.all<any>(promises)

      await exec("/usr/bin/perl", [dmgPropertiesFile], {
        cwd: getVendorPath(),
        env
      })

      await exec("sync")

      return packager.packagerOptions.effectiveOptionComputed == null || !(await packager.packagerOptions.effectiveOptionComputed({volumePath, specification, packager}))
    })

    if (!isContinue) {
      return
    }

    // dmg file must not exist otherwise hdiutil failed (https://github.com/electron-userland/electron-builder/issues/1308#issuecomment-282847594), so, -ov must be specified
    //noinspection SpellCheckingInspection
    const args = ["convert", tempDmg, "-ov", "-format", specification.format!, "-o", artifactPath]
    if (specification.format === "UDZO") {
      args.push("-imagekey", `zlib-level=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9"}`)
    }
    await spawn("hdiutil", addVerboseIfNeed(args))
    await exec("hdiutil", addVerboseIfNeed(["internet-enable", "-no"]).concat(artifactPath))

    await addLicenseToDmg(packager, artifactPath)

    this.packager.dispatchArtifactCreated(artifactPath, this, arch, packager.computeSafeArtifactName(artifactName, "dmg"))
  }

  computeVolumeName(custom?: string | null): string {
    const appInfo = this.packager.appInfo
    if (custom == null) {
      return `${appInfo.productFilename} ${appInfo.version}`
    }

    return custom
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
      warn("dmg.window.position is deprecated, please use dmg.window instead")
    }
    if (oldSize != null) {
      warn("dmg.window.size is deprecated, please use dmg.window instead")
    }
    if (oldIconSize != null) {
      warn("dmg.icon-size is deprecated, please use dmg.iconSize instead")
    }
    if (oldBackgroundColor != null) {
      warn("dmg.background-color is deprecated, please use dmg.backgroundColor instead")
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
      throw new Error("dmg.icon cannot be specified as empty string")
    }

    if (specification.backgroundColor != null) {
      if (specification.background != null) {
        throw new Error("Both dmg.backgroundColor and dmg.background are specified — please set the only one")
      }

      (specification as any).backgroundColor = require("parse-color")(specification.backgroundColor).hex
    }

    if (specification.backgroundColor == null && !("background" in specification)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("background.tiff")) {
        (specification as any).background = path.join(packager.buildResourcesDir, "background.tiff")
      }
      else if (resourceList.includes("background.png")) {
        (specification as any).background = path.join(packager.buildResourcesDir, "background.png")
      }
      else {
        (specification as any).background = path.join(this.helperDir, "background.tiff")
      }
    }

    if (specification.format == null) {
      if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
        (specification as any).format = "UDZO"
      }
      else if (packager.config.compression === "store") {
        (specification as any).format = "UDRO"
      }
      else {
        (specification as any).format = packager.config.compression === "maximum" ? "UDBZ" : "UDZO"
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

function addVerboseIfNeed(args: Array<string>): Array<string> {
  if (process.env.DEBUG_DMG === "true") {
    args.push("-verbose")
  }
  return args
}