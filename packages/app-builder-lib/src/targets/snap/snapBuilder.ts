import { getBinFromUrl, getBin } from "../../binDownload"
import { exec, log, isEmptyOrSpaces, copyDir, exists } from "builder-util"
import { rmdir, copyFile, mkdir, unlink, writeFile, rename, chmod, rm } from "fs-extra"
import * as path from "path"
import * as semver from "semver"
import { assets } from "./snapScripts"
import { getMksquashfs } from "./linuxTools"

export async function checkSnapcraftVersion() {
  const installMessage = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"
  const errorMessage = `snapcraft is not installed, please: ${installMessage}`

  const doCheckSnapVersion = (rawVersion: string, installMessage: string) => {
    if (rawVersion === "snapcraft, version edge") {
      return
    }

    const s = rawVersion.replace("snapcraft", "").replace(",", "").replace("version", "").trim().replace(/'/g, "")
    if (semver.lt(s, "4.0.0")) {
      throw new Error(`at least snapcraft 4.0.0 is required, but ${rawVersion} installed, please: ${installMessage}`)
    }
  }

  try {
    const out = await exec("snapcraft", ["--version"])
    doCheckSnapVersion(out, installMessage)
  } catch (err: any) {
    log.error({ message: err.message }, errorMessage)
    throw new Error(errorMessage)
  }
}
export interface SnapBuilderOptions {
  appDir: string
  stageDir: string
  output: string
  executableName: string
  arch: string

  icon?: string
  hooksDir?: string
  extraAppArgs?: string[]
  excludedAppFiles?: string[]

  compression?: "xz" | "lzo"

  template?: { template?: string; templateUrl?: string; templateSha512?: string }
}
export async function createSnap(options: SnapBuilderOptions) {
  const resolvedTemplateDir = await resolveTemplateDir(options.template)
  await snap(resolvedTemplateDir, options)
  await rm(options.stageDir, { recursive: true })
}

async function resolveTemplateDir(options: SnapBuilderOptions["template"]) {
  const { template, templateUrl, templateSha512 } = options || {}
  if (!isEmptyOrSpaces(template) || isEmptyOrSpaces(templateUrl)) {
    return template || ""
  }
  switch (templateUrl) {
    case "electron4":
    case "electron4:amd64":
      return await getBinFromUrl(
        "snap-template",
        "4.0-2",
        "PYhiQQ5KE4ezraLE7TOT2aFPGkBNjHLRN7C8qAPaC6VckHU3H+0m+JA/Wmx683fKUT2ZBwo9Mp82EuhmQo5WOQ==",
        "snap-template-electron-4.0-2-amd64.tar"
      )
    case "electron4:armhf":
    case "electron4:arm":
      return await getBinFromUrl(
        "snap-template",
        "4.0-1",
        "jK+E0d0kyzBEsFmTEUIsumtikH4XZp8NVs6DBtIBJqXAmVCuNHcmvDa0wcaigk8foU4uGZXsLlJtNj11X100Bg==",
        "snap-template-electron-4.0-1-armhf.tar"
      )
    default:
      return await getBin("snap-template-custom", templateUrl, templateSha512)
  }
}

async function snap(templateDir: string, options: SnapBuilderOptions): Promise<void> {
  const isUseTemplateApp = !isEmptyOrSpaces(templateDir)
  const stageDir = options.stageDir
  const snapMetaDir = isUseTemplateApp ? path.join(stageDir, "meta") : path.join(stageDir, "snap")

  if (options.icon) {
    await copyFile(options.icon, path.join(snapMetaDir, "gui", "icon" + path.extname(options.icon)))
  }
  if (options.hooksDir) {
    await copyDir(options.hooksDir, path.join(snapMetaDir, "hooks"))
  }

  const scriptDir = path.join(stageDir, "scripts")
  await mkdir(scriptDir, { recursive: true })

  if (options.executableName) {
    await writeCommandWrapper(options, isUseTemplateApp, scriptDir)
  }

  const chromeSandbox = path.join(options.appDir, "app", "chrome-sandbox")
  if (await exists(chromeSandbox)) {
    await unlink(chromeSandbox)
  }

  if (isUseTemplateApp) {
    await buildUsingTemplate(templateDir, options)
  } else {
    await buildWithoutTemplate(options, scriptDir)
  }
}

type CommandWrapperOptions = {
  stageDir?: string
  executableName: string
  extraAppArgs?: string[]
}

async function writeCommandWrapper(options: CommandWrapperOptions, isUseTemplateApp: boolean, scriptDir: string): Promise<void> {
  const appPrefix = isUseTemplateApp ? "" : "app/"
  const dir = isUseTemplateApp ? options.stageDir || "" : scriptDir

  const commandWrapperFile = path.join(dir, "command.sh")
  let text = `#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/${appPrefix}${options.executableName}"`

  if (options.extraAppArgs) {
    text += ` ${options.extraAppArgs.join(" ")}`
  }
  text += ' "$@"'

  await writeFile(commandWrapperFile, text, { mode: 0o755 })
  await chmod(commandWrapperFile, 0o755)
}

async function buildUsingTemplate(templateDir: string, options: SnapBuilderOptions): Promise<void> {
  const args = ["-no-progress", "-noappend", "-comp", options.compression || "xz", "-no-xattrs", "-no-fragments", "-all-root"]
  // const args = ["-no-progress", "-noappend", "-comp", options.compression || "xz", "-no-xattrs", "-no-fragments", "-all-root"]
  if (!log.isDebugEnabled) {
    args.unshift("-quiet")
  }
  const mksquash = await getMksquashfs()
  await exec(mksquash, [templateDir, options.stageDir, options.output, ...args])
}

async function buildWithoutTemplate(options: SnapBuilderOptions, scriptDir: string): Promise<void> {
  await checkSnapcraftVersion()

  const stageDir = options.stageDir

  for (const [name, assetGenerator] of Object.entries(assets)) {
    if (name.startsWith("desktop-scripts/")) {
      await writeFile(path.join(scriptDir, path.basename(name)), assetGenerator(), { mode: 0o755 })
    }
  }

  // multipass cannot access files outside of stage dir
  await copyDir(options.appDir, path.join(stageDir, "app"), { isUseHardLink: () => true })

  const isDestructiveMode = !!process.env.SNAP_DESTRUCTIVE_MODE

  // multipass cannot access files outside of snapcraft command working dir
  const snapEffectiveOutput = isDestructiveMode ? options.output : "out.snap"

  const args = ["snap", "--output", snapEffectiveOutput]
  if (options.arch && options.arch !== process.arch) {
    throw new Error(`snapcraft does not currently support building ${options.arch} on ${process.arch}`)
  }

  if (isDestructiveMode) {
    args.push("--destructive-mode")
  }

  await exec("snapcraft", args, { env: { ...process.env, SNAPCRAFT_HAS_TTY: "false" }, cwd: stageDir })

  if (!isDestructiveMode) {
    await rename(path.join(stageDir, snapEffectiveOutput), options.output)
  }
}
