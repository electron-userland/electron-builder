import { writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, test, vi } from "vitest"
import { PM } from "app-builder-lib/internal"
import { getYarnBerryNpmAuthEnv, installDependencies } from "app-builder-lib/src/util/installOrRebuild.js"
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

test("preserves environment variables referenced by Yarn Berry npm auth settings", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(
    path.join(projectDir, ".yarnrc.yml"),
    [
      'npmAuthIdent: "${ROOT_AUTH_IDENT}"',
      "npmScopes:",
      "  example:",
      '    npmAuthIdent: "${SCOPED_AUTH_IDENT}"',
      "npmRegistries:",
      '  "https://registry.example.test":',
      '    npmAuthToken: "${REGISTRY_AUTH_TOKEN}"',
      '    npmAuthIdent: "${REGISTRY_AUTH_IDENT}"',
    ].join("\n")
  )

  expect(
    await getYarnBerryNpmAuthEnv(projectDir, {
      ROOT_AUTH_IDENT: "root-ident",
      SCOPED_AUTH_IDENT: "scoped-ident",
      REGISTRY_AUTH_TOKEN: "registry-token",
      REGISTRY_AUTH_IDENT: "registry-ident",
    })
  ).toEqual({
    ROOT_AUTH_IDENT: "root-ident",
    SCOPED_AUTH_IDENT: "scoped-ident",
    REGISTRY_AUTH_TOKEN: "registry-token",
    REGISTRY_AUTH_IDENT: "registry-ident",
  })
})

test("does not preserve sensitive variables referenced outside Yarn npm auth settings", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(
    path.join(projectDir, ".yarnrc.yml"),
    ['npmAuthToken: "${ROOT_NPM_TOKEN}"', "npmScopes:", "  example:", '    npmAuthToken: "${SCOPED_NPM_TOKEN:-fallback}"', 'npmRegistryServer: "${GITHUB_TOKEN}"'].join("\n")
  )

  expect(
    await getYarnBerryNpmAuthEnv(projectDir, {
      ROOT_NPM_TOKEN: "root-token",
      SCOPED_NPM_TOKEN: "scoped-token",
      GITHUB_TOKEN: "publish-token",
    })
  ).toEqual({ ROOT_NPM_TOKEN: "root-token", SCOPED_NPM_TOKEN: "scoped-token" })
})

test("matches Yarn's own interpolation grammar", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "electron-builder-yarn-registry-env-" })
  await writeFile(
    path.join(projectDir, ".yarnrc.yml"),
    [
      "npmScopes:",
      // Yarn resolves nested defaults, so both names are real references.
      "  nested:",
      '    npmAuthToken: "${PRIMARY_TOKEN:-${FALLBACK_TOKEN}}"',
      // Yarn interpolates neither of these, so neither may reach the child.
      "  bare:",
      '    npmAuthToken: "$BARE_TOKEN"',
      "  escaped:",
      "    npmAuthToken: '\\${ESCAPED_TOKEN}'",
    ].join("\n")
  )

  expect(
    await getYarnBerryNpmAuthEnv(projectDir, {
      PRIMARY_TOKEN: "primary",
      FALLBACK_TOKEN: "fallback",
      BARE_TOKEN: "bare",
      ESCAPED_TOKEN: "escaped",
    })
  ).toEqual({ PRIMARY_TOKEN: "primary", FALLBACK_TOKEN: "fallback" })
})

test("passes only Yarn npm auth variables to the Yarn Berry install child", async ({ expect, tmpDir }) => {
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
