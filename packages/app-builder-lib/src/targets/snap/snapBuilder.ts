import { getBinFromUrl, getBin } from "../../binDownload"
import { exec, log, isEmptyOrSpaces, copyDir, exists } from "builder-util"
import { copyFile, mkdir, unlink, writeFile, rename, chmod, rm, readdir } from "fs-extra"
import * as path from "path"
import { assets as SNAP_ASSETS } from "./snapScripts"
import { getMksquashfs } from "./linuxTools"
import { checkSnapcraftVersion } from "builder-util/out/snap"

export interface SnapBuilderOptions extends CommandWrapperOptions {
  appDir: string
  output: string
  arch: string

  icon?: string
  hooksDir?: string
  excludedAppFiles?: string[]

  compression?: "xz" | "lzo"

  template?: string | SnapBuilderTemplate
}

type CommandWrapperOptions = {
  executableName: string
  stageDir: string
  extraAppArgs?: string[]
}

type SnapBuilderTemplate = {
  templateUrl: string
  templateSha512?: string
}

export async function createSnap(options: SnapBuilderOptions) {
  const resolvedTemplateDir = await resolveTemplateDir(options.template)
  await snap(options, resolvedTemplateDir)
  await rm(options.stageDir, { recursive: true })
}

async function resolveTemplateDir(template: SnapBuilderOptions["template"]) {
  if (template == null) {
    return undefined
  }
  if (typeof template === "string" && !isEmptyOrSpaces(template)) {
    return template
  }
  const { templateUrl, templateSha512 } = template as SnapBuilderTemplate
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

async function snap(options: SnapBuilderOptions, templateDir?: string): Promise<void> {
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

async function writeCommandWrapper(options: CommandWrapperOptions, isUseTemplateApp: boolean, scriptDir: string): Promise<void> {
  const appPrefix = isUseTemplateApp ? "" : "app/"
  const dir = isUseTemplateApp ? options.stageDir || "" : scriptDir

  const commandWrapperFile = path.join(dir, "command.sh")
  let text = `#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/${appPrefix}${options.executableName}"`

  if (options.extraAppArgs?.length) {
    text += ` ${options.extraAppArgs.join(" ")}`
  }
  text += ' "$@"'

  await writeFile(commandWrapperFile, text, { mode: 0o755 })
  await chmod(commandWrapperFile, 0o755)
}

async function buildUsingTemplate(templateDir: string, options: SnapBuilderOptions): Promise<void> {
  const stageDir = options.stageDir

  // https://github.com/electron-userland/electron-builder/issues/3608
  // even if electron-builder will correctly unset setgid/setuid, still, quite a lot of possibilities for user to create such incorrect permissions,
  // so, just unset it using chmod right before packaging
  const dirs = [stageDir, options.appDir, templateDir]
  await Promise.all(
    dirs
      .filter(dir => !!dir)
      .map(dir =>
        exec(`chmod -R g-s ${dir}`).catch((err: any) => {
          log.debug({ dir, message: err.message }, `cannot execute chmod`)
        })
      )
  )

  const templateContents = await readDirContents(templateDir)
  const stageContents = await readDirContents(stageDir)
  const appContents = await readDirContents(options.appDir, filename => {
    return !["LICENSES.chromium.html", "LICENSE.electron.txt", ...(options.excludedAppFiles ?? [])].includes(filename)
  })

  const contents = [...templateContents, ...stageContents, ...appContents]
  const params = ["-no-progress", "-noappend", "-comp", options.compression || "xz", "-no-xattrs", "-no-fragments", "-all-root"]
  if (!log.isDebugEnabled) {
    params.push("-quiet")
  }
  const mksquashfs = await getMksquashfs()
  await exec(mksquashfs, [templateDir, stageDir, ...contents, options.output, ...params])
}

async function readDirContents(dir: string, filter?: (filename: string) => boolean): Promise<string[]> {
  return (await readdir(dir)).reduce<string[]>((acc, curr) => {
    return filter?.(curr) ? [...acc, path.join(dir, curr)] : acc
  }, [])
}

async function buildWithoutTemplate(options: SnapBuilderOptions, scriptDir: string): Promise<void> {
  await checkSnapcraftVersion()
  // if (options.arch && options.arch !== process.arch) {
  //   throw new Error(`snapcraft does not currently support building ${options.arch} on ${process.arch}`)
  // }

  const stageDir = options.stageDir

  for (const [name, assetGenerator] of Object.entries(SNAP_ASSETS)) {
    if (name.startsWith("desktop-scripts/")) {
      await writeFile(path.join(scriptDir, path.basename(name)), assetGenerator().bytes, { mode: 0o755 })
    }
  }

  // multipass cannot access files outside of stage dir
  await copyDir(options.appDir, path.join(stageDir, "app"), { isUseHardLink: () => true })

  const isDestructiveMode = !!process.env.SNAP_DESTRUCTIVE_MODE

  // multipass cannot access files outside of snapcraft command working dir
  const snapEffectiveOutput = isDestructiveMode ? options.output : "out.snap"

  const args = ["snap", "--output", snapEffectiveOutput]
  if (isDestructiveMode) {
    args.push("--destructive-mode")
  }

  await exec("snapcraft", args, { env: { ...process.env, SNAPCRAFT_HAS_TTY: "false" }, cwd: stageDir })

  if (!isDestructiveMode) {
    await rename(path.join(stageDir, snapEffectiveOutput), options.output)
  }
}
