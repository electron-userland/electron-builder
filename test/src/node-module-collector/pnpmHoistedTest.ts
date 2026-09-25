import { describe, test, afterEach } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { ModuleManager } from "app-builder-lib/src/node-module-collector/moduleManager"
import { TmpDir } from "temp-file"

// The pnpm layout detection (`isHoisted`) and the nested-vs-hoisted version resolution are covered end to end by the
// live `pnpm install` + pack tests in HoistedNodeModuleTest.ts ("pnpm v11 hoisted/isolated ..."). What remains here is
// the one ModuleManager contract a real install cannot observe: with `skipDownwardSearch` (the isolated `.pnpm` store
// mode) the lookup never walks down into nested node_modules. In a real isolated install the collector resolves every
// package through its virtual-store path first, so the packaged output is the same either way; the flag only prevents
// the expensive (and on Windows, junction-confused) BFS through the store.

const projectTmpDir = new TmpDir("eb-pnpm-hoisted-test")

async function buildTempTree(packages: Record<string, { name: string; version: string; dependencies?: Record<string, string> }>): Promise<string> {
  const root = await projectTmpDir.createTempDir()
  for (const [rel, pkg] of Object.entries(packages)) {
    const absPath = path.join(root, rel)
    await fse.ensureDir(path.dirname(absPath))
    await fse.writeJson(absPath, pkg)
  }
  return root
}

describe("ModuleManager.locatePackageVersion skipDownwardSearch", { concurrent: false }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
    }
  })

  test("does not find a nested-only package when skipDownwardSearch is true", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/nested-pkg/package.json": { name: "nested-pkg", version: "3.0.0" },
    })

    const cache = new ModuleManager()

    // With skipDownwardSearch: true (virtual store mode) the nested package must NOT be found
    const result = await cache.locatePackageVersion({
      parentDir: root,
      pkgName: "nested-pkg",
      requiredRange: "^3.0.0",
      skipDownwardSearch: true,
    })

    expect(result).toBeNull()
  })
})
