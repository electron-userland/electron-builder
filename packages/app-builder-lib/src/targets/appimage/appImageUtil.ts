import { Arch, exec } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import { FileAssociation } from "../../options/FileAssociation"
import { IconInfo } from "../../platformPackager"
import { getAppImageTools } from "../tools"
import { copyIcons, copyMimeTypes } from "./appLauncher"
import { getTemplatePath } from "../../util/pathManager"

interface Options {
  productName: string
  productFilename: string
  executableName: string
  desktopEntry: string
  icons: IconInfo[]
  license?: string | null
  fileAssociations: FileAssociation[]
  compression?: "xz" | "lzo" | "zstd"
}

export interface AppImageBuilderOptions {
  appDir: string
  stageDir: string
  arch: Arch
  output: string
  options: Options
  removeStage?: boolean
}

export async function buildAppImage(opts: AppImageBuilderOptions): Promise<void> {
  const { stageDir, output, appDir, removeStage, options, arch } = opts

  // Write AppRun launcher and related files
  await writeAppLauncherAndRelatedFiles(opts)

  // Remove existing output file if it exists
  await fs.remove(output)

  const { libraries, runtime, mksquashfs } = await getAppImageTools(arch)
  await copyUsingHardlink(libraries, path.join(stageDir, "usr", "lib"))

  // Copy app directory to stage
  // mksquashfs doesn't support merging, so we copy the entire app dir
  await copyUsingHardlink(appDir, stageDir)

  const runtimeData = await fs.readFile(runtime)

  // Create squashfs with offset for runtime
  // await createSquashFs(options, runtimeData.length)

  const args: string[] = [stageDir, output, "-offset", runtimeData.length.toString(), "-all-root", "-noappend", "-no-progress", "-quiet", "-no-xattrs", "-no-fragments"]
  if (options.compression) {
    args.push("-comp", options.compression)

    if (options.compression === "xz") {
      args.push("-Xdict-size", "100%", "-b", "1048576")
    }
  }
  await exec(mksquashfs, args, {
    cwd: stageDir,
  })

  // Write runtime data at the beginning of the file
  await writeRuntimeData(output, runtimeData)

  // Make executable
  await fs.chmod(output, 0o755)

  if (removeStage) {
    await fs.remove(stageDir)
  }
}

async function writeRuntimeData(filePath: string, runtimeData: Buffer): Promise<void> {
  const fd = await fs.open(filePath, "r+")
  try {
    await fs.write(fd, runtimeData, 0, runtimeData.length, 0)
  } finally {
    await fs.close(fd)
  }
}

async function copyUsingHardlink(src: string, dest: string): Promise<void> {
  const stats = await fs.stat(src)

  if (stats.isDirectory()) {
    await fs.ensureDir(dest)
    const entries = await fs.readdir(src)

    for (const entry of entries) {
      const srcPath = path.join(src, entry)
      const destPath = path.join(dest, entry)
      await copyUsingHardlink(srcPath, destPath)
    }
  } else if (stats.isFile()) {
    await fs.ensureDir(path.dirname(dest))

    try {
      // Try to create hardlink first
      await fs.link(src, dest)
    } catch (error) {
      // Fall back to copying if hardlink fails
      await fs.copyFile(src, dest)
    }
  } else if (stats.isSymbolicLink()) {
    const linkTarget = await fs.readlink(src)
    await fs.ensureDir(path.dirname(dest))
    await fs.symlink(linkTarget, dest)
  }
}

async function writeAppLauncherAndRelatedFiles(opts: AppImageBuilderOptions): Promise<void> {
  const {
    stageDir,
    options: { license, executableName, productFilename, productName, desktopEntry },
  } = opts

  // Write desktop file
  const desktopFileName = `${executableName}.desktop`
  await fs.writeFile(path.join(stageDir, desktopFileName), desktopEntry, { mode: 0o666 })
  await copyIcons(opts)

  const templateConfig: Record<string, string> = {
    DesktopFileName: desktopFileName,
    ExecutableName: executableName,
    ProductName: productName,
    ProductFilename: productFilename,
    ResourceName: `appimagekit-${executableName}`,
  }

  const mimeTypeFile = await copyMimeTypes(opts)
  if (mimeTypeFile) {
    templateConfig.MimeTypeFile = mimeTypeFile
  }

  // Copy license file if provided
  if (license) {
    const licenseBaseName = path.basename(license)
    templateConfig.EulaFile = licenseBaseName
    await copyUsingHardlink(license, path.join(stageDir, licenseBaseName))
  }

  // Generate AppRun script
  const scriptTemplate = await fs.readFile(getTemplatePath(path.join("appimage", "AppRun.sh")), "utf-8")
  const appRunContent = renderTemplate(scriptTemplate, templateConfig)
  await fs.writeFile(path.join(stageDir, "AppRun"), appRunContent, { mode: 0o755 })
}

function renderTemplate(template: string, config: Record<string, string>): string {
  let result = template

  // Replace {{.Variable}} patterns
  for (const [key, value] of Object.entries(config)) {
    const regex = new RegExp(`{{\\s*\\.${key}\\s*}}`, "g")
    result = result.replace(regex, value || "")
  }

  // Handle conditional {{if .Variable}}...{{end}}
  result = result.replace(/{{if\s+\.(\w+)}}([\s\S]*?){{end}}/g, (match, varName, content) => {
    return config[varName] ? content : ""
  })

  return result
}
