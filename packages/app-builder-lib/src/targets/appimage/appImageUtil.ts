import { Arch, copyDir, copyFile, exec, log } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import { FileAssociation } from "../../options/FileAssociation"
import { IconInfo } from "../../platformPackager"
import { getAppImageTools } from "../../toolsets/linux"
import { copyIcons, copyMimeTypes } from "./appLauncher"
import { appendBlockmap } from "../differentialUpdateInfoBuilder"
import { BlockMapDataHolder } from "builder-util-runtime/src"
import { APP_RUN_ENTRYPOINT } from "./AppImageTarget"

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
}

export async function buildAppImage(opts: AppImageBuilderOptions): Promise<BlockMapDataHolder> {
  const { stageDir, output, appDir, options, arch } = opts

  try {
    await fs.remove(output)

    // Write AppRun launcher and related files
    await writeAppLauncherAndRelatedFiles(opts)

    const { runtimeLibraries: libraries, runtime, mksquashfs } = await getAppImageTools(arch)
    await copyDir(libraries, path.join(stageDir, "usr", "lib"))

    // Copy app directory to stage
    // mksquashfs doesn't support merging, so we copy the entire app dir
    await copyDir(appDir, stageDir)

    const runtimeData = await fs.readFile(runtime)

    // Create squashfs with offset for runtime
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
  } catch (error) {
    // Clean up partial build on failure
    await fs.remove(output).catch(() => {})
    throw error
  }
  const updateInfo = await appendBlockmap(output)
  return updateInfo
}

async function writeRuntimeData(filePath: string, runtimeData: Buffer): Promise<void> {
  const fd = await fs.open(filePath, "r+")
  try {
    await fs.write(fd, runtimeData, 0, runtimeData.length, 0)
  } finally {
    try {
      await fs.close(fd)
    } catch (closeError: any) {
      // Log but don't throw - preserve original error if any
      log.warn({ message: closeError.message, file: filePath }, `failed to close file descriptor`)
    }
  }
}

/**
 * Validates that a string is safe to use in shell scripts
 */
function validateShellSafeString(str: string, fieldName: string): void {
  if (/[`$"'\\]/.test(str)) {
    throw new Error(`${fieldName} contains shell metacharacters that could cause security issues: ${str}`)
  }
}

async function writeAppLauncherAndRelatedFiles(opts: AppImageBuilderOptions): Promise<void> {
  const {
    stageDir,
    options: { license, executableName, productFilename, productName, desktopEntry },
  } = opts

  // Validate shell-safe strings
  validateShellSafeString(executableName, "executableName")
  validateShellSafeString(productFilename, "productFilename")
  validateShellSafeString(productName, "productName")

  // Write desktop file
  const desktopFileName = `${executableName}.desktop`
  await fs.writeFile(path.join(stageDir, desktopFileName), desktopEntry, { mode: 0o666 })
  await copyIcons(opts)

  const templateConfig: AppRunScriptBase = {
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

  let finalConfig: AppRunScript = templateConfig

  // Copy license file if provided
  if (license) {
    // Validate license file exists
    const exists = await fs.pathExists(license)
    if (!exists) {
      throw new Error(`License file not found: ${license}`)
    }

    const licenseBaseName = path.basename(license)
    const ext = path.extname(license).toLowerCase()

    // Validate extension
    if (![".txt", ".html"].includes(ext)) {
      log.warn({ license, expected: ".txt or .html" }, `license file has unexpected extension`)
    }

    await copyFile(license, path.join(stageDir, licenseBaseName))

    finalConfig = {
      ...templateConfig,
      EulaFile: licenseBaseName,
      IsHtmlEula: ext === ".html",
    }
  }

  const appRunContent = generateAppRunScript(finalConfig)
  await fs.writeFile(path.join(stageDir, APP_RUN_ENTRYPOINT), appRunContent, { mode: 0o755 })
}

type AppRunScriptBase = {
  ExecutableName: string
  DesktopFileName: string
  ProductFilename: string
  ProductName: string
  ResourceName: string
  MimeTypeFile?: string
}

type AppRunScriptWithEula = AppRunScriptBase & {
  EulaFile: string
  IsHtmlEula: boolean
}

type AppRunScript = AppRunScriptBase | AppRunScriptWithEula

function hasEula(config: AppRunScript): config is AppRunScriptWithEula {
  return "EulaFile" in config && typeof config.EulaFile === "string"
}

function generateAppRunScript(config: AppRunScript): string {
  const eulaEnabled = hasEula(config)

  return `#!/bin/bash
set -e

THIS="$0"
# http://stackoverflow.com/questions/3190818/
args=("$@")
NUMBER_OF_ARGS="$#"

if [ -z "$APPDIR" ] ; then
  # Find the AppDir. It is the directory that contains AppRun.
  # This assumes that this script resides inside the AppDir or a subdirectory.
  # If this script is run inside an AppImage, then the AppImage runtime likely has already set $APPDIR
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

BIN="$APPDIR/${config.ExecutableName}"

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

error()
{
  if [ -x /usr/bin/zenity ] ; then
    LD_LIBRARY_PATH="" zenity --error --text "\${1}" 2>/dev/null
  elif [ -x /usr/bin/kdialog ] ; then
    LD_LIBRARY_PATH="" kdialog --msgbox "\${1}" 2>/dev/null
  elif [ -x /usr/bin/Xdialog ] ; then
    LD_LIBRARY_PATH="" Xdialog --msgbox "\${1}" 2>/dev/null
  else
    echo "\${1}"
  fi
  exit 1
}

yesno()
{
  TITLE=$1
  TEXT=$2
  if [ -x /usr/bin/zenity ] ; then
    LD_LIBRARY_PATH="" zenity --question --title="$TITLE" --text="$TEXT" 2>/dev/null || exit 0
  elif [ -x /usr/bin/kdialog ] ; then
    LD_LIBRARY_PATH="" kdialog --title "$TITLE" --yesno "$TEXT" || exit 0
  elif [ -x /usr/bin/Xdialog ] ; then
    LD_LIBRARY_PATH="" Xdialog --title "$TITLE" --clear --yesno "$TEXT" 10 80 || exit 0
  else
    echo "zenity, kdialog, Xdialog missing. Skipping \${THIS}."
    exit 0
  fi
}

check_dep()
{
  DEP=$1
  if [ -z $(which "$DEP") ] ; then
    echo "$DEP is missing. Skipping \${THIS}."
    exit 0
  fi
}

if [ -z "$APPIMAGE" ] ; then
  APPIMAGE="$APPDIR/AppRun"
  # not running from within an AppImage; hence using the AppRun for Exec=
fi

${
  eulaEnabled
    ? `if [ -z "$APPIMAGE_SILENT_INSTALL" ] ; then
  EULA_MARK_DIR="\${XDG_CONFIG_HOME:-$HOME/.config}/${config.ProductFilename}"
  EULA_MARK_FILE="$EULA_MARK_DIR/eulaAccepted"
  # show EULA only if desktop file doesn't exist
  if [ ! -e "$EULA_MARK_FILE" ] ; then
    if [ -x /usr/bin/zenity ] ; then
      # on cancel simply exits and our trap handler launches app, so, $isEulaAccepted is set here to 0 and then to 1 if EULA accepted
      isEulaAccepted=0
      LD_LIBRARY_PATH="" zenity --text-info --title="${config.ProductName}" --filename="$APPDIR/${config.EulaFile}" --ok-label=Agree --cancel-label=Disagree ${config.IsHtmlEula ? "--html" : ""}
    elif [ -x /usr/bin/Xdialog ] ; then
      isEulaAccepted=0
      LD_LIBRARY_PATH="" Xdialog --title "${config.ProductName}" --textbox "$APPDIR/${config.EulaFile}" 30 80 --ok-label Agree --cancel-label Disagree
    elif [ -x /usr/bin/kdialog ] ; then
      # cannot find any option to force Agree/Disagree buttons for kdialog. And official example exactly with OK button https://techbase.kde.org/Development/Tutorials/Shell_Scripting_with_KDE_Dialogs#Example_21._--textbox_dialog_box
      # in any case we pass labels text
      isEulaAccepted=0
      LD_LIBRARY_PATH="" kdialog --textbox "$APPDIR/${config.EulaFile}" --yes-label Agree --cancel-label "Disagree"
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
fi`
    : ""
}
`
}
