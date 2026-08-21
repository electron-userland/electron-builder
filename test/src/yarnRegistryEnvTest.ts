import { writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, test, vi } from "vitest"
import { PM } from "app-builder-lib/internal"
import { getYarnBerryNpmAuthTokenEnv, installDependencies } from "app-builder-lib/src/util/installOrRebuild.js"
import { detectPackageManager } from "app-builder-lib/src/node-module-collector/packageManager.js"
import { rebuild } from "app-builder-lib/src/util/rebuild.js"
import { streamSpawnToFile } from "app-builder-lib/src/util/streamSpawnToFile.js"

vi.mock("app-builder-lib/src/node-module-collector/packageManager.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/node-module-collector/packageManager.js")>()
  return { ...actual, detectPackageManager: vi.fn() }
})
vi.mock("app-builder-lib/src/util/rebuild.js", () => ({ rebuild: vi.fn() }))
vi.mock("app-builder-lib/src/util/streamSpawnToFile.js", () => ({ streamSpawnToFile: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test("preserves the environment variable referenced by a Yarn Berry npmAuthToken", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(path.join(projectDir, ".yarnrc.yml"), ["npmRegistries:", '  "https://registry.example.test":', '    npmAuthToken: "${XXX_NPM_TOKEN}"'].join("\n"))

  expect(await getYarnBerryNpmAuthTokenEnv(projectDir, { XXX_NPM_TOKEN: "registry-token" })).toEqual({ XXX_NPM_TOKEN: "registry-token" })
})

test("does not preserve sensitive variables referenced outside Yarn npmAuthToken settings", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(
    path.join(projectDir, ".yarnrc.yml"),
    ['npmAuthToken: "${ROOT_NPM_TOKEN}"', "npmScopes:", "  example:", '    npmAuthToken: "${SCOPED_NPM_TOKEN:-fallback}"', 'npmRegistryServer: "${GITHUB_TOKEN}"'].join("\n")
  )

  expect(
    await getYarnBerryNpmAuthTokenEnv(projectDir, {
      ROOT_NPM_TOKEN: "root-token",
      SCOPED_NPM_TOKEN: "scoped-token",
      GITHUB_TOKEN: "publish-token",
    })
  ).toEqual({ ROOT_NPM_TOKEN: "root-token", SCOPED_NPM_TOKEN: "scoped-token" })
})

test("passes only Yarn npmAuthToken variables to the Yarn Berry install child", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(path.join(projectDir, ".yarnrc.yml"), ['npmAuthToken: "${XXX_NPM_TOKEN}"', 'npmRegistryServer: "${GITHUB_TOKEN}"'].join("\n"))
  vi.stubEnv("XXX_NPM_TOKEN", "registry-token")
  vi.stubEnv("GITHUB_TOKEN", "publish-token")
  vi.mocked(detectPackageManager).mockResolvedValue({ pm: PM.YARN_BERRY, resolvedDirectory: projectDir, corepackConfig: undefined, detectionMethod: "test" })
  vi.mocked(streamSpawnToFile).mockResolvedValue({ code: 0, stderr: "" })

  await installDependencies({} as any, { appDir: projectDir, projectDir, workspaceRoot: null }, { frameworkInfo: { version: "39.0.0", useCustomDist: false } }, {})

  const childEnv = vi.mocked(streamSpawnToFile).mock.calls[0][4]
  expect(childEnv.XXX_NPM_TOKEN).toBe("registry-token")
  expect(childEnv.GITHUB_TOKEN).toBeUndefined()
  expect(rebuild).toHaveBeenCalledOnce()
})
