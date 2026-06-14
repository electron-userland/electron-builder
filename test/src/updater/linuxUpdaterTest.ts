import { GithubOptions } from "builder-util-runtime"
import { execSync } from "child_process"
import { AppUpdater, DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { afterEach, expect, ExpectStatic, test } from "vitest"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, tuneTestUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"

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

// sequence.concurrent is enabled globally; individual tests set
// process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER — sequential execution prevents bleed.
describe.sequential("LinuxUpdater.detectPackageManager", () => {
  afterEach(() => {
    delete process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
  })

  function makeUpdater(availableCommands: string[]) {
    const instance: any = Object.create(RpmUpdater.prototype)
    instance._logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    instance.hasCommand = (cmd: string) => availableCommands.includes(cmd)
    return instance
  }

  // detectPackageManager narrows candidates to [pmOverride] when env-var is set,
  // then still calls hasCommand — the override is only returned if hasCommand passes.

  test("env-var override is returned when hasCommand succeeds for it", () => {
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "yum"
    const updater = makeUpdater(["yum"]) // yum is available
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("yum")
  })

  test("env-var override is ignored and falls back to pms[0] when hasCommand fails for it", () => {
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "yum"
    const updater = makeUpdater([]) // nothing available, including yum
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("zypper") // pms[0] fallback
  })

  test("env-var whitespace is trimmed before hasCommand check", () => {
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "  dnf  "
    const updater = makeUpdater(["dnf"]) // dnf is available
    expect(updater.detectPackageManager(["zypper", "dnf"])).toBe("dnf")
  })

  test("env-var with unsafe shell characters is rejected with a warning", () => {
    const warns: string[] = []
    const instance: any = Object.create(RpmUpdater.prototype)
    instance._logger = { info: () => {}, warn: (m: string) => warns.push(m), error: () => {}, debug: () => {} }
    instance.hasCommand = (cmd: string) => cmd === "zypper"
    process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "rm -rf"
    const result = instance.detectPackageManager(["zypper", "dnf"])
    // unsafe override rejected → falls back to normal PM scanning → zypper found
    expect(result).toBe("zypper")
    expect(warns.some(w => w.includes("unsafe characters"))).toBe(true)
  })

  test("returns first available PM in priority order when no env-var", () => {
    const updater = makeUpdater(["dnf"]) // only dnf present
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("dnf")
  })

  test("prefers higher-priority PM when multiple are available", () => {
    const updater = makeUpdater(["dnf", "yum"]) // both present; zypper wins in list but not available
    expect(updater.detectPackageManager(["zypper", "dnf", "yum", "rpm"])).toBe("dnf")
  })

  test("falls back to pms[0] and warns when no PM is available and no env-var", () => {
    const warns: string[] = []
    const instance: any = Object.create(DebUpdater.prototype)
    instance._logger = { info: () => {}, warn: (m: string) => warns.push(m), error: () => {}, debug: () => {} }
    instance.hasCommand = () => false
    const result = instance.detectPackageManager(["apt", "dpkg"])
    expect(result).toBe("apt")
    expect(warns.some(w => w.includes("No package manager found"))).toBe(true)
  })

  test("single-item priority list returns that PM when available", () => {
    const updater = makeUpdater(["pacman"])
    expect(updater.detectPackageManager(["pacman"])).toBe("pacman")
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
