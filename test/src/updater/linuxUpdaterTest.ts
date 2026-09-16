import { isEmptyOrSpaces, TmpDir } from "builder-util"
import { GenericServerOptions } from "builder-util-runtime"
import { execSync } from "child_process"
import { Arch } from "electron-builder"
import { AppUpdater, DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { afterAll, afterEach, expect, ExpectStatic, test } from "vitest"
import { assertThat } from "../helpers/fileAssert"
import { createLocalServer } from "../helpers/launchAppCrossPlatform"
import { EXTENDED_TIMEOUT } from "../helpers/packTester"
import { createTestAppAdapter, NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { ApplicationUpdatePaths, doBuild } from "./blackboxUpdateHelpers"

type UpdateFileExtension = "deb" | "rpm" | "AppImage" | "pacman"

// The update packages are built in-job with the checked-out electron-builder (no external fixture
// repo). A single build per target is shared by every package-manager variant in the same run.
const buildTmpDir = new TmpDir("linux-updater-test-build")
const builtUpdateDirPromises = new Map<UpdateFileExtension, Promise<string>>()

afterAll(async () => {
  await buildTmpDir.cleanup()
})

function buildUpdatePackage(expect: ExpectStatic, extension: UpdateFileExtension): Promise<string> {
  let dirPromise = builtUpdateDirPromises.get(extension)
  if (dirPromise == null) {
    dirPromise = (async () => {
      const outDirs: Array<ApplicationUpdatePaths> = []
      // only the new version needs to exist on the update server — the "installed" old version is
      // simulated by the TestAppAdapter below
      await doBuild(expect, outDirs, extension, Arch.x64, buildTmpDir, false, null, [NEW_VERSION_NUMBER])
      return outDirs[0].dir
    })()
    builtUpdateDirPromises.set(extension, dirPromise)
  }
  return dirPromise
}

const runTest = async (expect: ExpectStatic, updaterClass: any, expectedExtension: UpdateFileExtension) => {
  // serve the freshly built artifacts (installer + latest-linux.yml) from a localhost static server
  // via the generic provider — the same download code path the s3/spaces providers resolve to
  const updateDir = await buildUpdatePackage(expect, expectedExtension)
  const { server, port } = await createLocalServer(updateDir)
  try {
    const testAppAdapter = await createTestAppAdapter(OLD_VERSION_NUMBER)
    const updater = new updaterClass(null, testAppAdapter)
    tuneTestUpdater(updater, { platform: "linux" })

    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })

    const actualEvents = trackEvents(updater)

    const updateCheckResult = await updater.checkForUpdates()
    // updateInfo is produced by the in-job build (sha512/size/releaseDate vary per build), so assert
    // the stable fields explicitly instead of snapshotting
    expect(updateCheckResult?.updateInfo.version).toBe(NEW_VERSION_NUMBER)

    const { updateFile: installer, packageFile } = (await updateCheckResult?.downloadPromise)!
    expect(packageFile).toBeUndefined()
    expect(installer.endsWith(`.${expectedExtension}`)).toBeTruthy()
    await assertThat(expect, installer).isFile()
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "update-downloaded"])

    const didUpdate = updater.install(true, false)
    expect(didUpdate).toBeTruthy()
  } finally {
    server.close()
  }
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

describe("LinuxUpdater.detectPackageManager", { sequential: true }, () => {
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

// sequential: ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER is process-global; extended timeout: the update
// package is built in-job on first use
describe.ifLinux("Linux Updater Test", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  for (const distro in packageManagerMap) {
    const { pms, updater: Updater, extension } = packageManagerMap[distro as keyof typeof packageManagerMap]
    for (const pm of pms) {
      test(`test ${distro} download and install (${pm})`, async context => {
        if (!determineEnvironment(distro)) {
          context.skip()
        }
        // honor the CI matrix package-manager pin (mirrors blackboxUpdateLinuxSuite) so each matrix
        // entry builds/installs only its own package manager variant
        if (!isEmptyOrSpaces(process.env.PACKAGE_MANAGER_TO_TEST) && process.env.PACKAGE_MANAGER_TO_TEST !== pm) {
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
