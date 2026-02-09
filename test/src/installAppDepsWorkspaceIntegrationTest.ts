import { isEmptyOrSpaces } from "builder-util"
import { copy, outputFile, readJson, writeJson } from "fs-extra"
import { execFile } from "child_process"
import * as path from "path"
import { TmpDir } from "temp-file"
import { promisify } from "util"
import * as which from "which"

const hasBun = !isEmptyOrSpaces(which.sync("bun", { nothrow: true }))
const hasPnpm = !isEmptyOrSpaces(which.sync("pnpm", { nothrow: true }))
const fixtureDir = path.join(__dirname, "..", "fixtures", "test-app-install-app-deps-workspace")
const electronBuilderCli = path.join(__dirname, "..", "..", "packages", "electron-builder", "cli.js")
const execFileAsync = promisify(execFile)

async function setPostinstallScripts(rootDir: string) {
  for (const packageName of ["foo", "bar"]) {
    const packageJsonPath = path.join(rootDir, "packages", packageName, "package.json")
    const packageJson = await readJson(packageJsonPath)
    packageJson.scripts = {
      ...(packageJson.scripts || {}),
      postinstall: `node ${electronBuilderCli} install-app-deps`,
    }
    await writeJson(packageJsonPath, packageJson, { spaces: 2 })
  }
}

async function configureBunWorkspace(rootDir: string) {
  const rootPackageJsonPath = path.join(rootDir, "package.json")
  const rootPackageJson = await readJson(rootPackageJsonPath)
  rootPackageJson.workspaces = ["packages/*"]
  await writeJson(rootPackageJsonPath, rootPackageJson, { spaces: 2 })
}

async function configurePnpmWorkspace(rootDir: string) {
  await outputFile(path.join(rootDir, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n')
}

describe.ifNotWindows("install-app-deps workspace integration", () => {
  test.runIf(hasBun)("bun workspace postinstall uses package-local projectRootPath and avoids classic-level rebuild", async ({ expect }) => {
    const tmpDir = new TmpDir("install-app-deps-bun-integration")
    const rootDir = await tmpDir.createTempDir({ prefix: "test-project" })

    try {
      await copy(fixtureDir, rootDir)
      await configureBunWorkspace(rootDir)
      await setPostinstallScripts(rootDir)

      const fooDir = path.join(rootDir, "packages", "foo")
      const barDir = path.join(rootDir, "packages", "bar")
      const { stdout, stderr } = await execFileAsync("bun", ["install", "--verbose"], {
        cwd: rootDir,
        env: {
          ...process.env,
          DEBUG: "electron-rebuild",
        },
        maxBuffer: 40 * 1024 * 1024,
      })
      const output = `${stdout}\n${stderr}`

      expect(output).toContain('[Scripts] Starting scripts for "@test/foo"')
      expect(output).toContain('[Scripts] Starting scripts for "@test/bar"')
      expect(output).toContain(`projectRootPath: '${fooDir}'`)
      expect(output).toContain(`projectRootPath: '${barDir}'`)
      expect(output).toContain(`scanning: ${path.join(fooDir, "node_modules")}`)
      expect(output).toContain(`scanning: ${path.join(barDir, "node_modules")}`)
      expect(output).not.toContain(`scanning: ${path.join(rootDir, "node_modules")}`)
      expect(output).not.toContain("moduleName=classic-level")
      expect(output).not.toContain("node-gyp failed to rebuild")
    } finally {
      await tmpDir.cleanup()
    }
  })

  test.runIf(hasPnpm)("pnpm workspace postinstall uses package-local projectRootPath and avoids classic-level rebuild", async ({ expect }) => {
    const tmpDir = new TmpDir("install-app-deps-pnpm-integration")
    const rootDir = await tmpDir.createTempDir({ prefix: "test-project" })

    try {
      await copy(fixtureDir, rootDir)
      await configurePnpmWorkspace(rootDir)
      await setPostinstallScripts(rootDir)

      const fooDir = path.join(rootDir, "packages", "foo")
      const barDir = path.join(rootDir, "packages", "bar")
      const { stdout, stderr } = await execFileAsync("pnpm", ["install"], {
        cwd: rootDir,
        env: {
          ...process.env,
          DEBUG: "electron-rebuild",
        },
        maxBuffer: 40 * 1024 * 1024,
      })
      const output = `${stdout}\n${stderr}`

      expect(output).toContain("packages/foo postinstall$")
      expect(output).toContain("packages/bar postinstall$")
      expect(output).toContain(`projectRootPath: '${fooDir}'`)
      expect(output).toContain(`projectRootPath: '${barDir}'`)
      expect(output).toContain(`scanning: ${path.join(fooDir, "node_modules")}`)
      expect(output).toContain(`scanning: ${path.join(barDir, "node_modules")}`)
      expect(output).not.toContain("rebuilding classic-level with args")
      expect(output).not.toContain("node-gyp failed to rebuild")
    } finally {
      await tmpDir.cleanup()
    }
  })
})
