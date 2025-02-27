import { getTemplatePath } from "../../util/pathManager"
import { writeFileSync, mkdirSync, utimesSync } from "fs"
import { readFileSync } from "fs-extra"
import { join, dirname } from "path"

type Asset = {
  bytes: Buffer
  info: AssetInfo
}

type AssetInfo = {
  name: string
  size: number
  mode: number
  modTime: number
}

function desktopScriptsDesktopCommonSh(): Asset {
  const name = "desktop-scripts/desktop-common.sh"
  return {
    bytes: readFileSync(getTemplatePath(join("snap", name))),
    info: {
      name: name,
      size: 16604,
      mode: 0o644,
      modTime: 1731819267,
    },
  }
}

export function desktopScriptsDesktopGnomeSpecificSh(): Asset {
  const name = "desktop-scripts/desktop-gnome-specific.sh"
  return {
    bytes: readFileSync(getTemplatePath(join("snap", name))),
    info: {
      name: name,
      size: 1401,
      mode: 0o644,
      modTime: 1731819267,
    },
  }
}

export function desktopScriptsDesktopInitSh(): Asset {
  const name = "desktop-scripts/desktop-init.sh"
  return {
    bytes: readFileSync(getTemplatePath(join("snap", name))),
    info: {
      name: name,
      size: 1530,
      mode: 0o644,
      modTime: 1731819267,
    },
  }
}

export const SNAP_ASSETS: Record<string, () => Asset> = {
  "desktop-scripts/desktop-common.sh": desktopScriptsDesktopCommonSh,
  "desktop-scripts/desktop-gnome-specific.sh": desktopScriptsDesktopGnomeSpecificSh,
  "desktop-scripts/desktop-init.sh": desktopScriptsDesktopInitSh,
}

export function asset(name: string): Buffer {
  const assetFunc = SNAP_ASSETS[name.replace(/\\/g, "/")]
  if (!assetFunc) throw new Error(`Asset ${name} not found`)
  return assetFunc().bytes
}

export function assetInfo(name: string): AssetInfo {
  const assetFunc = SNAP_ASSETS[name.replace(/\\/g, "/")]
  if (!assetFunc) throw new Error(`AssetInfo ${name} not found`)
  return assetFunc().info
}

export function restoreAsset(dir: string, name: string): void {
  const data = asset(name)
  const info = assetInfo(name)
  mkdirSync(join(dir, dirname(name)), { recursive: true })
  writeFileSync(join(dir, name), data, { mode: info.mode })
  utimesSync(join(dir, name), info.modTime, info.modTime)
}

export function restoreAssets(dir: string, name: string): void {
  const children = Object.keys(SNAP_ASSETS).filter(asset => asset.startsWith(name + "/"))
  if (!children.length) {
    restoreAsset(dir, name)
  } else {
    for (const child of children) {
      restoreAssets(dir, child)
    }
  }
}
