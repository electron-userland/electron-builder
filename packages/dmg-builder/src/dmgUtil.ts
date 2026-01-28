import { DmgOptions, MacPackager, PlatformPackager } from "app-builder-lib"
import { downloadArtifact } from "app-builder-lib"
import { exec, executeFinally, exists, isEmptyOrSpaces, TmpDir } from "builder-util"
import { writeFile } from "fs-extra"
import * as path from "path"
import { DmgBuildConfig } from "./dmg.js"
import { hdiUtil, hdiutilTransientExitCodes } from "./hdiuil.js"

export { DmgTarget } from "./dmg.js"

const root = path.join(__dirname, "..")

export function getDmgTemplatePath() {
  return path.join(root, "templates")
}

async function getDmgVendorPath(): Promise<string> {
  const customDmgbuildPath = process.env.CUSTOM_DMGBUILD_PATH?.trim()
  if (customDmgbuildPath) {
    return path.resolve(customDmgbuildPath)
  }

  // https://github.com/electron-userland/electron-builder-binaries/releases/tag/dmg-builder%401.1.0
  const releaseVersion = "9614277"
  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const config = {
    "dmgbuild-bundle-arm64-9614277.tar.gz": "28e11550cf990f78180a2d82090f35a24588beda3d9165098837714f90ee47ce",
    "dmgbuild-bundle-x86_64-9614277.tar.gz": "4dbf1cc186af62921f8b6f4a5956b28d8622d211797a8b05eb75a260ee9c3fdb",
  }
  const filename: keyof typeof config = `dmgbuild-bundle-${arch}-${releaseVersion}.tar.gz`
  const file = await downloadArtifact({
    releaseName: "dmg-builder@1.1.0",
    filenameWithExt: filename,
    checksums: config,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.resolve(file, "dmgbuild")
}

export async function attachAndExecute(dmgPath: string, readWrite: boolean, forceDetach: boolean, task: (devicePath: string) => Promise<any>) {
  //noinspection SpellCheckingInspection
  const args = ["attach", "-noverify", "-noautoopen"]
  if (readWrite) {
    args.push("-readwrite")
  }

  args.push(dmgPath)
  const attachResult = await hdiUtil(args)
  const deviceResult = attachResult == null ? null : /^(\/dev\/\w+)/.exec(attachResult)
  const device = deviceResult == null || deviceResult.length !== 2 ? null : deviceResult[1]
  if (device == null) {
    throw new Error(`Cannot mount: ${attachResult}`)
  }
  const volumePath = await findMountPath(path.basename(device))
  if (volumePath == null) {
    throw new Error(`Cannot find volume mount path for device: ${device}`)
  }

  return await executeFinally(task(volumePath), () => detach(device, forceDetach))
}

/**
 * Find the mount path for a specific device from `hdiutil info`.
 */
async function findMountPath(devName: string, index: number = 1): Promise<string | null> {
  const info = await hdiUtil(["info"])
  const lines = info!.split("\n")
  const regex = new RegExp(`^/dev/${devName}(s\\d+)?\\s+\\S+\\s+(/Volumes/.+)$`)
  const matches: string[] = []

  for (const line of lines) {
    const result = regex.exec(line)
    if (result && result.length >= 3) {
      matches.push(result[2])
    }
  }

  return matches.length >= index ? matches[index - 1] : null
}

export async function detach(name: string, alwaysForce: boolean) {
  return hdiUtil(["detach", "-quiet", name]).catch(async e => {
    if (hdiutilTransientExitCodes.has(e.code) || alwaysForce) {
      // Delay then force unmount with verbose output
      await new Promise(resolve => setTimeout(resolve, 3000))
      return hdiUtil(["detach", "-force", name])
    }
    throw e
  })
}

export async function computeBackground(packager: PlatformPackager<any>): Promise<string> {
  const resourceList = await packager.resourceList
  if (resourceList.includes("background.tiff")) {
    return path.join(packager.buildResourcesDir, "background.tiff")
  } else if (resourceList.includes("background.png")) {
    return path.join(packager.buildResourcesDir, "background.png")
  } else {
    return path.join(getDmgTemplatePath(), "background.tiff")
  }
}

/** @internal */
export function serializeString(data: string) {
  return (
    '  $"' +
    data
      .match(/.{1,32}/g)!
      .map(it => it.match(/.{1,4}/g)!.join(" "))
      .join('"\n  $"') +
    '"'
  )
}

type DmgBuilderConfig = {
  appPath: string
  artifactPath: string
  volumeName: string
  specification: DmgOptions
  packager: MacPackager
}

export async function customizeDmg({ appPath, artifactPath, volumeName, specification, packager }: DmgBuilderConfig): Promise<boolean> {
  const isValidIconTextSize = !!specification.iconTextSize && specification.iconTextSize >= 10 && specification.iconTextSize <= 16
  const iconTextSize = isValidIconTextSize ? specification.iconTextSize : 12
  const volumePath = path.join("/Volumes", volumeName)
  // https://github.com/electron-userland/electron-builder/issues/2115

  const settings: DmgBuildConfig = {
    title: path.basename(volumePath),
    "icon-size": specification.iconSize,
    "text-size": iconTextSize,

    "compression-level": Number(process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9"),
    // filesystem: specification.filesystem || "HFS+",
    format: specification.format,
    contents:
      specification.contents?.map(c => ({
        path: c.path || appPath, // path is required, when ommitted, appPath is used (backward compatibility
        x: c.x,
        y: c.y,
        name: c.name,
        type: c.type === "dir" ? "file" : c.type, // appdmg expects "file" for directories
        // hide_extension: c.hideExtension,
      })) || [],
  }

  if (specification.badgeIcon) {
    let badgeIcon = await packager.getResource(specification.badgeIcon)
    if (badgeIcon && badgeIcon.toLowerCase().endsWith(".icon")) {
      badgeIcon = await packager.generateIcnsFromIcon(badgeIcon)
    }
    settings["badge-icon"] = badgeIcon
  } else {
    settings.icon = await packager.getResource(specification.icon)
  }

  if (specification.backgroundColor != null || specification.background == null) {
    settings["background-color"] = specification.backgroundColor || "#ffffff"

    const window = specification.window
    if (window != null) {
      settings.window = {
        position: {
          x: window.x ?? 100,
          y: window.y ?? 400,
        },
        size: {
          width: window.width ?? 540,
          height: window.height ?? 300,
        },
      }
    }
  } else {
    settings.background = specification.background == null ? null : await transformBackgroundFileIfNeed(specification.background, packager.info.tempDirManager)
  }

  if (!isEmptyOrSpaces(settings.background)) {
    const size = await getImageSizeUsingSips(settings.background)
    settings.window = { position: { x: 400, y: Math.round((1440 - size.height) / 2) }, size, ...settings.window }
  }

  const settingsFile = await packager.getTempFile(".json")
  await writeFile(settingsFile, JSON.stringify(settings, null, 2))

  const dmgbuild = await getDmgVendorPath()
  await exec(dmgbuild, ["-s", settingsFile, path.basename(volumePath), artifactPath], {
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf8",
    },
  })

  // effectiveOptionComputed, when present, is purely for verifying result during test execution
  return (
    packager.packagerOptions.effectiveOptionComputed == null ||
    (await attachAndExecute(artifactPath, false, true, async volumePath => {
      return !(await packager.packagerOptions.effectiveOptionComputed!({
        volumePath,
        specification: {
          ...specification,
          // clean up `contents` for test snapshot verification since app path is absolute to a unique tmp dir
          contents: specification.contents?.map((c: any) => ({
            ...c,
            path: path.extname(c.path ?? "") === ".app" ? path.relative(packager.projectDir, c.path) : c.path,
          })),
        },
        packager,
      }))
    }))
  )
}

export async function transformBackgroundFileIfNeed(file: string, tmpDir: TmpDir): Promise<string> {
  if (path.extname(file.toLowerCase()) === ".tiff") {
    return file
  }

  const retinaFile = file.replace(/\.([a-z]+)$/, "@2x.$1")
  if (await exists(retinaFile)) {
    const tiffFile = await tmpDir.getTempFile({ suffix: ".tiff" })
    await exec("tiffutil", ["-cathidpicheck", file, retinaFile, "-out", tiffFile])
    return tiffFile
  }

  return file
}

export async function getImageSizeUsingSips(background: string) {
  const stdout = await exec("sips", ["-g", "pixelHeight", "-g", "pixelWidth", background])

  let width = 0
  let height = 0

  const re = /([a-zA-Z]+):\s*(\d+)/
  const lines = stdout.split("\n")

  for (const line of lines) {
    const match = re.exec(line)
    if (!match) {
      continue
    }

    const key = match[1]
    const value = parseInt(match[2], 10)

    if (isNaN(value)) {
      throw new Error(`Failed to parse number from line: "${line}"`)
    }

    if (key === "pixelWidth") {
      width = value
    } else if (key === "pixelHeight") {
      height = value
    }
  }

  return { width, height }
}
