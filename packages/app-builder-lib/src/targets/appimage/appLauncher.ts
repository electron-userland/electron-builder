import * as path from "path"
import * as fs from "fs-extra"
import { copyOrLinkFile, log } from "builder-util"
import { AppImageBuilderOptions } from "./appImageUtil"

const ICON_DIR_RELATIVE_PATH = "usr/share/icons/hicolor"
const MIME_TYPE_DIR_RELATIVE_PATH = "usr/share/mime"

/**
 * Escapes special XML characters to prevent injection
 */
function xmlEscape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

export async function copyIcons(options: AppImageBuilderOptions): Promise<void> {
  const { stageDir, options: configuration } = options
  const iconCommonDir = path.join(stageDir, ICON_DIR_RELATIVE_PATH)

  await fs.ensureDir(iconCommonDir)

  const icons = configuration.icons
  if (!icons || icons.length === 0) {
    throw new Error("At least one icon is required for AppImage")
  }

  const iconExtWithDot = path.extname(icons[0].file)
  const iconFileName = `${configuration.executableName}${iconExtWithDot}`
  const maxIconIndex = icons.length - 1

  const iconInfoList = icons.map(icon => {
    if (path.extname(icon.file) !== iconExtWithDot) {
      throw new Error(`All icons must have the same extension: expected ${iconExtWithDot}, but got ${icon.file}`)
    }
    let iconSizeDir: string

    if (iconExtWithDot === ".svg") {
      // SVG icons go in scalable directory
      iconSizeDir = "scalable"
    } else {
      iconSizeDir = `${icon.size}x${icon.size}/apps`
    }

    const iconRelativeToStageFile = path.join(ICON_DIR_RELATIVE_PATH, iconSizeDir, iconFileName)
    const iconDir = path.join(iconCommonDir, iconSizeDir)
    const iconFile = path.join(iconDir, iconFileName)
    return { icon, iconDir, iconFile, iconRelativeToStageFile }
  })
  await Promise.all(
    iconInfoList.map(async ({ icon, iconDir, iconFile }) => {
      await fs.ensureDir(iconDir)
      await copyOrLinkFile(icon.file, iconFile)
    })
  )
  // Create symlinks for the last (largest) icon
  const { iconRelativeToStageFile } = iconInfoList[maxIconIndex]
  await fs.symlink(iconRelativeToStageFile, path.join(stageDir, iconFileName))
  await fs.symlink(iconRelativeToStageFile, path.join(stageDir, ".DirIcon"))
}

export async function copyMimeTypes(options: AppImageBuilderOptions): Promise<string | null> {
  const {
    stageDir,
    options: { fileAssociations, productName, executableName },
  } = options

  if (!fileAssociations || fileAssociations.length === 0) {
    return null
  }

  const mimeTypeParts: string[] = []

  for (const fileAssociation of fileAssociations) {
    if (!fileAssociation.mimeType) {
      continue
    }

    // XML-escape to prevent injection
    mimeTypeParts.push(`<mime-type type="${xmlEscape(fileAssociation.mimeType)}">`)
    mimeTypeParts.push(`  <comment>${xmlEscape(productName)} document</comment>`)

    // Handle extension(s)
    const extensions = Array.isArray(fileAssociation.ext) ? fileAssociation.ext : [fileAssociation.ext]

    for (const ext of extensions) {
      // Validate extension doesn't contain dangerous characters
      if (!/^[a-zA-Z0-9_-]+$/.test(ext)) {
        log.warn({ extension: ext }, `file extension contains unexpected characters and may not be supported`)
      }
      mimeTypeParts.push(`  <glob pattern="*.${xmlEscape(ext)}"/>`)
    }

    mimeTypeParts.push('  <generic-icon name="x-office-document"/>')
    mimeTypeParts.push("</mime-type>")
  }

  // If no mime-types were generated, return null
  if (mimeTypeParts.length === 0) {
    return null
  }

  const mimeTypeDir = path.join(stageDir, MIME_TYPE_DIR_RELATIVE_PATH)
  const fileName = `${executableName}.xml`
  const mimeTypeFile = path.join(mimeTypeDir, fileName)

  await fs.ensureDir(mimeTypeDir)

  const xmlContent = ['<?xml version="1.0"?>', '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">', ...mimeTypeParts, "</mime-info>"].join("\n")

  await fs.writeFile(mimeTypeFile, xmlContent, { mode: 0o666 })

  return path.join(MIME_TYPE_DIR_RELATIVE_PATH, fileName)
}
