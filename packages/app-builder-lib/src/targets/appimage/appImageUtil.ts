import * as path from "path"
import * as fs from "fs-extra"
import { execFile } from "child_process"
import { promisify } from "util"
import { Arch, exec, exec, log } from "builder-util"
import { copyIcons, copyMimeTypes } from "./appLauncher"
import { FileAssociation } from "../../options/FileAssociation"
import { getAppImageTools } from "../tools"

const execFileAsync = promisify(execFile)

export interface IconInfo {
  file: string
  size: number
}

export interface AppImageConfiguration {
  productName: string
  productFilename: string
  executableName: string
  desktopEntry: string
  icons: IconInfo[]
  fileAssociations: FileAssociation[]
}

export interface AppImageBuilderOptions {
  appDir: string
  stageDir: string
  arch: Arch
  output: string
  template?: string
  license?: string | null
  configuration: AppImageConfiguration
  compression?: "xz" | "lzo" | "zstd"
  removeStage?: boolean
}

export async function buildAppImage(options: AppImageBuilderOptions): Promise<void> {
  const { stageDir, output, appDir, removeStage } = options

  // Write AppRun launcher and related files
  await writeAppLauncherAndRelatedFiles(options)

  // Remove existing output file if it exists
  await fs.remove(output)

  const { libraries, runtime, mksquashfs } = await getAppImageTools(options.arch)
  await copyUsingHardlink(libraries, path.join(stageDir, "usr", "lib"))

  // Copy app directory to stage
  // mksquashfs doesn't support merging, so we copy the entire app dir
  await copyUsingHardlink(appDir, stageDir)

  const runtimeData = await fs.readFile(runtime)

  // Create squashfs with offset for runtime
  // await createSquashFs(options, runtimeData.length)

  const args: string[] = [
    options.stageDir,
    options.output,
    "-offset",
    runtimeData.length.toString(),
    "-all-root",
    "-noappend",
    "-no-progress",
    "-quiet",
    "-no-xattrs",
    "-no-fragments",
  ]

  if (options.compression) {
    args.push("-comp", options.compression)

    if (options.compression === "xz") {
      args.push("-Xdict-size", "100%", "-b", "1048576")
    }
  }
  await exec(mksquashfs, args, {
    cwd: options.stageDir,
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

async function writeAppLauncherAndRelatedFiles(options: AppImageBuilderOptions): Promise<void> {
  const { stageDir, configuration, template, license } = options

  // Write desktop file
  const desktopFileName = `${configuration.executableName}.desktop`
  await fs.writeFile(path.join(stageDir, desktopFileName), configuration.desktopEntry, { mode: 0o666 })

  // Copy icons
  await copyIcons(options)

  // Copy MIME types
  const mimeTypeFile = await copyMimeTypes(options)

  // Prepare template configuration
  const templateConfig = {
    DesktopFileName: desktopFileName,
    ExecutableName: configuration.executableName,
    ProductName: configuration.productName,
    ProductFilename: configuration.productFilename,
    ResourceName: `appimagekit-${configuration.executableName}`,
    EulaFile: "",
    MimeTypeFile: mimeTypeFile,
  }

  // Copy license file if provided
  if (license) {
    const licenseBaseName = path.basename(license)
    templateConfig.EulaFile = licenseBaseName
    await copyUsingHardlink(license, path.join(stageDir, licenseBaseName))
  }

  // Generate AppRun script
  let appRunContent: string
  if (template) {
    appRunContent = await fs.readFile(template, "utf-8")
  } else {
    appRunContent = getDefaultAppRunTemplate()
  }

  // Replace template variables
  appRunContent = renderTemplate(appRunContent, templateConfig)

  // Write AppRun file
  const appRunPath = path.join(stageDir, "AppRun")
  await fs.writeFile(appRunPath, appRunContent, { mode: 0o755 })
}

function renderTemplate(template: string, config: Record<string, any>): string {
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

function getDefaultAppRunTemplate(): string {
  return `#!/bin/bash
set -e

if [ ! -z "$DEBUG" ] ; then
  env
  set -x
fi

THIS="$0"
args=("$@")
NUMBER_OF_ARGS="$#"

if [ -z "$APPDIR" ] ; then
  path="$(dirname "$(readlink -f "\${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/$1" ]]; do
    path=\${path%/*}
  done
  APPDIR="$path"
fi

export PATH="\${APPDIR}:\${APPDIR}/usr/sbin:\${PATH}"
export XDG_DATA_DIRS="./share/:/usr/share/gnome:/usr/local/share/:/usr/share/:\${XDG_DATA_DIRS}"
export LD_LIBRARY_PATH="\${APPDIR}/usr/lib:\${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="\${APPDIR}"/usr/share/:"\${XDG_DATA_DIRS}":/usr/share/gnome/:/usr/local/share/:/usr/share/
export GSETTINGS_SCHEMA_DIR="\${APPDIR}/usr/share/glib-2.0/schemas:\${GSETTINGS_SCHEMA_DIR}"

BIN="$APPDIR/{{.ExecutableName}}"

if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then
  trap atexit EXIT
fi

isEulaAccepted=1

atexit()
{
  if [ $isEulaAccepted == 1 ] ; then
    if [ $NUMBER_OF_ARGS -eq 0 ] ; then
      exec "$BIN"
    else
      exec "$BIN" "\${args[@]}"
    fi
  fi
}

if [ -z "$APPIMAGE" ] ; then
  APPIMAGE="$APPDIR/AppRun"
fi

{{if .EulaFile}}
if [ -z "$APPIMAGE_SILENT_INSTALL" ] ; then
  EULA_MARK_DIR="\${XDG_CONFIG_HOME:-$HOME/.config}/{{.ProductFilename}}"
  EULA_MARK_FILE="$EULA_MARK_DIR/eulaAccepted"
  if [ ! -e "$EULA_MARK_FILE" ] ; then
    if [ -x /usr/bin/zenity ] ; then
      isEulaAccepted=0
      LD_LIBRARY_PATH="" zenity --text-info --title="{{.ProductName}}" --filename="$APPDIR/{{.EulaFile}}" --ok-label=Agree --cancel-label=Disagree
    elif [ -x /usr/bin/kdialog ] ; then
      LD_LIBRARY_PATH="" kdialog --textbox "$APPDIR/{{.EulaFile}}" --yes-label Agree --cancel-label "Disagree"
    fi

    case $? in
      0)
          isEulaAccepted=1
          echo "License accepted"
          mkdir -p "$EULA_MARK_DIR"
          touch "$EULA_MARK_FILE"
      ;;
        1)
          echo "License not accepted"
          exit 0
      ;;
        -1)
          echo "An unexpected error has occurred."
          isEulaAccepted=1
      ;;
    esac
  fi
fi
{{end}}
`
}
