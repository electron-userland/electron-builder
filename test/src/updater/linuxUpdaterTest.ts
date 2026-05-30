import { GithubOptions } from "builder-util-runtime"
import { AppUpdater, DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { ExpectStatic } from "vitest"
import { execSync } from "child_process"

type UpdateFileExtension = "deb" | "rpm" | "AppImage" | "pacman"

const runTest = async (expect: ExpectStatic, updaterClass: any, expectedExtension: UpdateFileExtension) => {
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

const packageManagerMap: {
  [key: string]: {
    pms: string[]
    updater: typeof AppUpdater
    extension: UpdateFileExtension
  }
} = {
  fedora: {
    pms: ["zypper", "dnf", "yum", "rpm"],
    updater: RpmUpdater,
    extension: "rpm",
  },
  debian: {
    pms: ["apt", "dpkg"],
    updater: DebUpdater,
    extension: "deb",
  },
  arch: {
    pms: ["pacman"],
    updater: PacmanUpdater,
    extension: "pacman",
  },
}

describe.ifLinux("Linux Updater Test", () => {
  for (const distro in packageManagerMap) {
    const { pms, updater: Updater, extension } = packageManagerMap[distro as keyof typeof packageManagerMap]
    for (const pm of pms) {
      test(`test ${distro} download and install (${pm})`, async context => {
        if (!determineEnvironment(distro)) {
          context.skip()
        }
        process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = pm
        await runTest(context.expect, Updater, extension)
      })
    }
  }

  // test.ifLinux("test AppImage download", async ({ expect }) => {
  //   await runTest(expect, AppImageUpdater, "AppImage")
  // })
})
