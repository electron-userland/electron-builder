import { GithubOptions } from "builder-util-runtime"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { ExpectStatic } from "vitest"
import { spawnSync } from "child_process"

const runTest = async (expect: ExpectStatic, updaterClass: any, expectedExtension: "deb" | "rpm" | "AppImage" | "pacman") => {
  const testAppAdapter = await createTestAppAdapter("1.0.1")
  const updater = new updaterClass(null, testAppAdapter)
  tuneTestUpdater(updater, { platform: "linux" })

  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test",
  })

  const updateCheckResult = await validateDownload(expect, updater)

  const files = await updateCheckResult?.downloadPromise
  expect(files!.length).toEqual(1)
  const installer = files![0]
  expect(installer.endsWith(`.${expectedExtension}`)).toBeTruthy()
  await assertThat(expect, installer).isFile()

  const didUpdate = updater.install(true, false)
  expect(didUpdate).toBeTruthy()
}

test.ifEnv(
  (() => {
    const isCentos = spawnSync(`grep -q -i "centos" /etc/os-release`).status === 0
    console.error("isCentos", isCentos)
    return isCentos
  })()
)("test rpm download", async ({ expect }) => {
  await runTest(expect, RpmUpdater, "rpm")
})

test.ifEnv(
  (() => {
    const isArchLinux = spawnSync(`grep -q -i "archlinux" /etc/os-release`).status === 0
    console.error("isArchLinux", isArchLinux)
    return isArchLinux
  })()
)("test pacman download and install", async ({ expect }) => {
  await runTest(expect, PacmanUpdater, "pacman")
})

test.ifEnv(
  (() => {
    const isDeb = spawnSync(`grep -q -i "debian" /etc/os-release`).status === 0
    console.error("isDeb", isDeb)
    return isDeb
  })()
)("test debian download and install", async ({ expect }) => {
  await runTest(expect, DebUpdater, "deb")
})

// test.ifLinux("test AppImage download", async ({ expect }) => {
//   await runTest(expect, AppImageUpdater, "AppImage")
// })
