import { GithubOptions } from "builder-util-runtime"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { ExpectStatic } from "vitest"
import { execSync } from "child_process"

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

const determineEnvironment = (target: string) => {
  return execSync(`cat /etc/*release | grep "^ID="`).toString().includes(target)
}

test.ifEnv((() => determineEnvironment("fedora"))())("test rpm download", async ({ expect }) => {
  await runTest(expect, RpmUpdater, "rpm")
})

test.ifEnv((() => determineEnvironment("arch"))())("test pacman download and install", async ({ expect }) => {
  await runTest(expect, PacmanUpdater, "pacman")
})

test.ifEnv((() => determineEnvironment("debian"))())("test debian download and install", async ({ expect }) => {
  await runTest(expect, DebUpdater, "deb")
})

// test.ifLinux("test AppImage download", async ({ expect }) => {
//   await runTest(expect, AppImageUpdater, "AppImage")
// })
