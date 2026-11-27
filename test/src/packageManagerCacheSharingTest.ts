import * as path from "path"
import { inject, type ExpectStatic } from "vitest"
import { assertPack, linuxDirTarget } from "./helpers/packTester.js"

// The env assertPack installs and builds a fixture with, captured by stopping each run before its install.
async function captureTestEnv(expect: ExpectStatic): Promise<NodeJS.ProcessEnv> {
  const captured: Array<NodeJS.ProcessEnv> = []
  await expect(
    assertPack(
      expect,
      "test-app-one",
      { targets: linuxDirTarget },
      {
        projectDirCreated: (_projectDir, _tmpDir, testEnv) => {
          captured.push(testEnv)
          throw new Error("stop before install")
        },
      }
    )
  ).rejects.toThrow("stop before install")
  expect(captured).toHaveLength(1)
  return captured[0]
}

test("fixture installs share package-manager caches but not HOME", async ({ expect }) => {
  const first = await captureTestEnv(expect)
  const second = await captureTestEnv(expect)

  const cacheDir = inject("packageManagerCacheDir")
  const workerCacheDir = path.join(cacheDir, `worker-${process.env.VITEST_POOL_ID}`)
  const expected = {
    COREPACK_HOME: path.join(cacheDir, "corepack"),
    npm_config_cache: path.join(cacheDir, "npm"),
    pnpm_config_store_dir: path.join(cacheDir, "pnpm-store"),
    pnpm_config_cache_dir: path.join(cacheDir, "pnpm-cache"),
    pnpm_config_package_import_method: "clone-or-copy",
    YARN_CACHE_FOLDER: path.join(workerCacheDir, "yarn"),
    YARN_GLOBAL_FOLDER: path.join(workerCacheDir, "yarn-berry"),
  }
  expect(first).toMatchObject(expected)
  expect(second).toMatchObject(expected)

  expect(first.HOME).not.toBe(second.HOME)
})
