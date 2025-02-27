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
  mode: number
  modTime: number
}

export const SNAP_ASSETS: Record<string, () => Asset> = (() => {
  const files = {
    "desktop-scripts/desktop-common.sh": {
      mode: 0o644,
      modTime: 1731819267,
    },
    "desktop-scripts/desktop-gnome-specific.sh": {
      mode: 0o644,
      modTime: 1731819267,
    },
    "desktop-scripts/desktop-init.sh": {
      mode: 0o644,
      modTime: 1731819267,
    },
  }
  return Object.entries(files).reduce<Record<string, () => Asset>>((acc, [name, info]) => {
    acc[name] = () => ({
      bytes: readFileSync(getTemplatePath(join("snap", name))),
      info: {
        name,
        mode: info.mode,
        modTime: info.modTime,
      },
    })
    return acc
  }, {})
})()

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
