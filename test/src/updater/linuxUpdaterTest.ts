import { GithubOptions } from "builder-util-runtime"
import { AppUpdater, DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { afterEach, expect, ExpectStatic, test } from "vitest"
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

describe("LinuxUpdater.detectPackageManager", () => {
  const originalEnv = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
    } else {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = originalEnv
    }
  })

  function makeUpdater(availableCommands: string[]) {
    const instance = Object.create(RpmUpdater.prototype) as any
    instance._logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    instance.hasCommand = (cmd: string) => availableCommands.includes(cmd)
    return instance
  }

  test("returns env-var override regardless of available commands", () => {
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "yum"
    const updater = makeUpdater([]) // no commands available
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("yum")
  })

  test("returns first available command in priority order", () => {
    const updater = makeUpdater(["dnf"]) // only dnf present
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("dnf")
  })

  test("prefers higher-priority command when multiple are present", () => {
    const updater = makeUpdater(["dnf", "yum"]) // both present, zypper wins in priority but not available
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("dnf")
  })

  test("falls back to first in list and warns when nothing is available", () => {
    const warns: string[] = []
    const instance = Object.create(DebUpdater.prototype) as any
    instance._logger = { info: () => {}, warn: (m: string) => warns.push(m), error: () => {}, debug: () => {} }
    instance.hasCommand = () => false
    const result = instance.detectPackageManager(["apt", "dpkg"])
    expect(result).toBe("apt")
    expect(warns.some(w => w.includes("No package manager found"))).toBe(true)
  })

  test("handles single-item priority list", () => {
    const updater = makeUpdater(["pacman"])
    expect(updater.detectPackageManager(["pacman"])).toBe("pacman")
  })

  test("env-var whitespace is trimmed", () => {
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "  dnf  "
    const updater = makeUpdater([])
    expect(updater.detectPackageManager(["zypper", "dnf"])).toBe("dnf")
  })
})

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
