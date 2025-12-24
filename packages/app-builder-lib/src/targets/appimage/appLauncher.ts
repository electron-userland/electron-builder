import * as path from 'path';
import * as fs from 'fs-extra';
import { AppImageBuilderOptions } from './appImageUtil';

const ICON_DIR_RELATIVE_PATH = 'usr/share/icons/hicolor';
const MIME_TYPE_DIR_RELATIVE_PATH = 'usr/share/mime';

export async function copyIcons(options: AppImageBuilderOptions): Promise<void> {
  const { stageDir, configuration } = options;
  const iconCommonDir = path.join(stageDir, ICON_DIR_RELATIVE_PATH);

  await fs.ensureDir(iconCommonDir);

  const icons = configuration.icons;
  if (!icons || icons.length === 0) {
    return;
  }

  const iconExtWithDot = path.extname(icons[0].file);
  const iconFileName = `${configuration.executableName}${iconExtWithDot}`;
  const maxIconIndex = icons.length - 1;

  // Process all icons in parallel
  await Promise.all(
    icons.map(async (icon, taskIndex) => {
      let iconSizeDir: string;

      if (iconExtWithDot === '.svg') {
        // SVG icons go in scalable directory
        iconSizeDir = 'scalable';
      } else {
        iconSizeDir = `${icon.size}x${icon.size}/apps`;
      }

      const iconRelativeToStageFile = path.join(
        ICON_DIR_RELATIVE_PATH,
        iconSizeDir,
        iconFileName
      );
      const iconDir = path.join(iconCommonDir, iconSizeDir);
      await fs.ensureDir(iconDir);

      const iconFile = path.join(iconDir, iconFileName);

      // Copy icon using hardlink or fallback to copy
      try {
        await fs.link(icon.file, iconFile);
      } catch {
        await fs.copyFile(icon.file, iconFile);
      }

      // Create symlinks for the last (largest) icon
      if (taskIndex === maxIconIndex) {
        await fs.symlink(
          iconRelativeToStageFile,
          path.join(stageDir, iconFileName)
        );
        await fs.symlink(
          iconRelativeToStageFile,
          path.join(stageDir, '.DirIcon')
        );
      }
    })
  );
}

export async function copyMimeTypes(
  options: AppImageBuilderOptions
): Promise<string> {
  const { stageDir, configuration } = options;
  const fileAssociations = configuration.fileAssociations;

  if (!fileAssociations || fileAssociations.length === 0) {
    return '';
  }

  const mimeTypeParts: string[] = [];

  for (const fileAssociation of fileAssociations) {
    if (!fileAssociation.mimeType) {
      continue;
    }

    mimeTypeParts.push(`<mime-type type="${fileAssociation.mimeType}">`);
    mimeTypeParts.push(
      `  <comment>${configuration.productName} document</comment>`
    );

    // Handle extension(s)
    const extensions = Array.isArray(fileAssociation.ext)
      ? fileAssociation.ext
      : [fileAssociation.ext];

    for (const ext of extensions) {
      mimeTypeParts.push(`  <glob pattern="*.${ext}"/>`);
    }

    mimeTypeParts.push('  <generic-icon name="x-office-document"/>');
    mimeTypeParts.push('</mime-type>');
  }

  // If no mime-types were generated, return empty string
  if (mimeTypeParts.length === 0) {
    return '';
  }

  const mimeTypeDir = path.join(stageDir, MIME_TYPE_DIR_RELATIVE_PATH);
  const fileName = `${configuration.executableName}.xml`;
  const mimeTypeFile = path.join(mimeTypeDir, fileName);

  await fs.ensureDir(mimeTypeDir);

  const xmlContent = [
    '<?xml version="1.0"?>',
    '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">',
    ...mimeTypeParts,
    '</mime-info>',
  ].join('\n');

  await fs.writeFile(mimeTypeFile, xmlContent, { mode: 0o666 });

  return path.join(MIME_TYPE_DIR_RELATIVE_PATH, fileName);
}