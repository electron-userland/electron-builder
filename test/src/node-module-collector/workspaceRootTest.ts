import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { log } from "builder-util"
import { PM } from "app-builder-lib/internal"
import { determinePackageManagerEnv, findWorkspaceRoot } from "app-builder-lib/src/node-module-collector/index"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Files = Record<string, string | object>

/**
 * Writes `files` (relative path → JSON object or raw text) under a fresh temp dir owned by the per-test `tmpDir`
 * fixture (auto-cleaned after the test) and returns that dir.
 */
async function buildTempTree(tmpDir: TmpDir, files: Files): Promise<string> {
  const root = await tmpDir.getTempDir({ prefix: "eb-workspace-root-test" })
  for (const [rel, content] of Object.entries(files)) {
    const absPath = path.join(root, rel)
    await fse.ensureDir(path.dirname(absPath))
    if (typeof content === "string") {
      await fse.writeFile(absPath, content)
    } else {
      await fse.writeJson(absPath, content)
    }
  }
  return root
}

const appPkg = { name: "app", version: "1.0.0", packageManager: "pnpm@11.0.0" }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findWorkspaceRoot", { sequential: true }, () => {
  test("pnpm: pnpm-workspace.yaml in a parent directory is detected as the workspace root (no shell-out)", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "package.json": { name: "monorepo", version: "0.0.0", private: true },
      "apps/app/package.json": appPkg,
    })
    expect(await findWorkspaceRoot(PM.PNPM, path.join(root, "apps", "app"))).toBe(root)
  })

  test("pnpm: pnpm-workspace.yaml wins over a nearer package.json `workspaces` field, which pnpm ignores", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "apps/package.json": { name: "apps", version: "0.0.0", workspaces: ["*"] },
      "apps/app/package.json": appPkg,
    })
    expect(await findWorkspaceRoot(PM.PNPM, path.join(root, "apps", "app"))).toBe(root)
  })

  test("pnpm: still falls back to a package.json `workspaces` field when there is no pnpm-workspace.yaml", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "package.json": { name: "monorepo", version: "0.0.0", workspaces: ["apps/*"] },
      "apps/app/package.json": appPkg,
    })
    expect(await findWorkspaceRoot(PM.PNPM, path.join(root, "apps", "app"))).toBe(root)
  })

  test("pnpm: returns undefined when no workspace config exists above the project", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "package.json": appPkg,
    })
    expect(await findWorkspaceRoot(PM.PNPM, root)).toBeUndefined()
  })
})

describe("determinePackageManagerEnv", { sequential: true }, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("pnpm workspace: workspaceRoot resolves to the directory holding pnpm-workspace.yaml", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "package.json": { name: "monorepo", version: "0.0.0", private: true },
      "apps/app/package.json": appPkg,
    })
    const projectDir = path.join(root, "apps", "app")
    const warn = vi.spyOn(log, "warn")

    const env = await determinePackageManagerEnv({ projectDir, appDir: projectDir, workspaceRoot: undefined }).value
    expect(env.pm).toBe(PM.PNPM)
    expect(await env.workspaceRoot).toBe(root)
    expect(warn).not.toHaveBeenCalled()
  })

  test("pnpm workspace: keeps the located root and warns when the package manager cannot be re-detected there", async ({ expect, tmpDir }) => {
    // No lockfile and no `packageManager` field at the root: `detectPackageManager([root])` falls through to the process
    // environment and resolves no directory. The located root must survive instead of collapsing to the app dir (#10187).
    const root = await buildTempTree(tmpDir, {
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "package.json": { name: "monorepo", version: "0.0.0", private: true },
      "apps/app/package.json": appPkg,
    })
    const projectDir = path.join(root, "apps", "app")
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    const env = await determinePackageManagerEnv({ projectDir, appDir: projectDir, workspaceRoot: undefined }).value
    expect(env.pm).toBe(PM.PNPM)
    expect(await env.workspaceRoot).toBe(root)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][1]).toMatch(/workspace root located/)
  })

  test("no workspace: workspaceRoot falls back to the project dir", async ({ expect, tmpDir }) => {
    const root = await buildTempTree(tmpDir, {
      "package.json": appPkg,
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    })
    const warn = vi.spyOn(log, "warn")

    const env = await determinePackageManagerEnv({ projectDir: root, appDir: root, workspaceRoot: undefined }).value
    expect(env.pm).toBe(PM.PNPM)
    expect(await env.workspaceRoot).toBe(root)
    expect(warn).not.toHaveBeenCalled()
  })
})
