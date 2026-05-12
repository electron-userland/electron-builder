import { ToolsetConfig } from "app-builder-lib"
import { isEmptyOrSpaces } from "builder-util/out/util"
import { execSync } from "child_process"
import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxLinuxTests(appimage: ToolsetConfig["appimage"]): void {
  describe(`appimage tool: ${appimage}`, optionsForFlakyE2E, () => {
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "arm64")("AppImage - arm64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.arm64, { appimage })
    })

    // only works on x64, so this will fail on arm64 macs due to arch mismatch
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - x64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.x64, { appimage })
    })
  })
}

const packageManagerMap: {
  [key: string]: { pms: string[]; target: string }
} = {
  fedora: { pms: ["zypper", "dnf", "yum", "rpm"], target: "rpm" },
  debian: { pms: ["apt", "dpkg"], target: "deb" },
  arch: { pms: ["pacman"], target: "pacman" },
}

const determineEnvironment = (distro: string) => {
  return execSync(`cat /etc/*release | grep "^ID="`).toString().includes(distro)
}

export function registerBlackboxLinuxPackageManagerTests(): void {
  for (const distro in packageManagerMap) {
    const { pms, target } = packageManagerMap[distro as keyof typeof packageManagerMap]
    for (const pm of pms) {
      test(`${distro} - (${pm})`, optionsForFlakyE2E, async (context: TestContext) => {
        if (!determineEnvironment(distro)) {
          context.skip()
        }
        // skip if already set to avoid interfering with other package manager tests
        if (!isEmptyOrSpaces(process.env.PACKAGE_MANAGER_TO_TEST) && process.env.PACKAGE_MANAGER_TO_TEST !== pm) {
          context.skip()
        }
        await runTest(context, target, pm, Arch.x64)
      })
    }
  }
}
