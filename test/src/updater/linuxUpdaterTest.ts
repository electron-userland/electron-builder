import { GithubOptions } from "builder-util-runtime"
import { AppImageUpdater, BaseUpdater, DebUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, trackEvents, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"

const runTest = async (updaterClass: typeof BaseUpdater, expectedExtension: "deb" | "rpm" | "AppImage") => {
  const testAppAdapter = await createTestAppAdapter("1.0.1")
  const updater = new (updaterClass as any)(null, testAppAdapter)
  tuneTestUpdater(updater, { platform: "linux" })
  const actualEvents = trackEvents(updater)

  let checkCiRunnerError: string = ""
  updater.addListener("error", (message: string) => {
    checkCiRunnerError = message
  })

  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test",
  })

  const updateCheckResult = await validateDownload(updater)

  const files = (await updateCheckResult?.downloadPromise)!
  expect(files.length).toEqual(1)
  const installer = files[0]
  expect(installer.endsWith(`.${expectedExtension}`)).toBeTruthy()
  await assertThat(installer).isFile()

  expect(actualEvents).toMatchObject(["checking-for-update", "update-available", "update-downloaded"])

  // AppImage requires APPIMAGE env var which can't exist on an emulated test updater
  if (expectedExtension != "AppImage") {
    updater.quitAndInstall(true, false)
    // Sudo doesn't exist on Github CI runners (probably only self-hosted?), so we execute `quitAndInstall` to validate logic, unfortunately, cannot verify the installation itself
    expect(checkCiRunnerError).toMatchObject("[Error: Error executing command as another user: No authentication agent found.]")
  }
}

test.ifLinux("test rpm download", async () => {
  await runTest(RpmUpdater, "rpm")
})

test.ifLinux("test deb download", async () => {
  await runTest(DebUpdater, "deb")
})

test.ifLinux.skip("test AppImage download", async () => {
  await runTest(AppImageUpdater, "AppImage")
})
