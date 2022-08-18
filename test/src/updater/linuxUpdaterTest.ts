import { GithubOptions } from "builder-util-runtime"
import { DebUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"

const runTest = async (updaterClass: any, expectedExtension: "deb" | "rpm" | "AppImage") => {
  const testAppAdapter = await createTestAppAdapter("1.0.1")
  const updater = new updaterClass(null, testAppAdapter)
  tuneTestUpdater(updater, { platform: "linux" })

  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test",
  })

  const updateCheckResult = await validateDownload(updater)

  const files = await updateCheckResult?.downloadPromise
  expect(files!.length).toEqual(1)
  const installer = files![0]
  expect(installer.endsWith(`.${expectedExtension}`)).toBeTruthy()
  await assertThat(installer).isFile()

  // updater.quitAndInstall(true, false)
}

test("test rpm download", async () => {
  await runTest(RpmUpdater, "rpm")
})

test("test deb download", async () => {
  await runTest(DebUpdater, "deb")
})

// test.ifLinux("test AppImage download", async () => {
//   await runTest(AppImageUpdater, "AppImage")
// })
