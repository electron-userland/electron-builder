import { ToolsetConfig } from "app-builder-lib"
import { isEmptyOrSpaces } from "builder-util"
import { execSync } from "child_process"
import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, optionsForFlakyMultiHopE2E, runInstallOnNextLaunchTest, runKeyRotationTest, runSignedManifestTest, runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxLinuxTests(toolset: Required<Pick<ToolsetConfig, "appimage">>): void {
  const appimage = toolset.appimage
  const toolName = typeof appimage === "object" && appimage != null ? "custom" : appimage
  describe(`appimage tool: ${toolName}`, optionsForFlakyE2E, () => {
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "arm64")("AppImage - arm64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.arm64, { appimage })
    })

    // only works on x64, so this will fail on arm64 macs due to arch mismatch
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - x64", optionsForFlakyE2E, async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.x64, { appimage })
    })

    // Full install-on-next-launch cycle (#7807): the update is queued via
    // quitAndInstall({ waitUntilNextLaunch: true }) and installed automatically at the next startup
    // (AppImage replaces the file without elevation, so the automatic path is supported).
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - install on next launch - x64", optionsForFlakyE2E, async (context: TestContext) => {
      await runInstallOnNextLaunchTest(context, "AppImage", "appimage", Arch.x64, { appimage }, "automatic")
    })

    // Ed25519-signed latest-linux.yml (runtime-generated key): the installed app verifies the manifest before updating.
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - signed update manifest - x64", optionsForFlakyE2E, async (context: TestContext) => {
      await runSignedManifestTest(context, "AppImage", "appimage", Arch.x64, { appimage })
    })

    // Key rotation A → [A, B] → B over three builds, including manifests the installed app must refuse.
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - key rotation - x64", optionsForFlakyMultiHopE2E, async (context: TestContext) => {
      await runKeyRotationTest(context, "AppImage", "appimage", Arch.x64, { appimage })
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

    // Install-on-next-launch cycle (#7807) for package-manager targets. deb/rpm/pacman never install a
    // pending update automatically at startup (their doInstall elevates via pkexec/sudo, which would show
    // an authentication prompt at launch), so the app calls installPendingUpdateIfAvailable() explicitly.
    // One run per distro is enough — the per-package-manager install commands are already covered by the
    // immediate quitAndInstall tests above.
    test(`${distro} - install on next launch (explicit installPendingUpdateIfAvailable)`, optionsForFlakyE2E, async (context: TestContext) => {
      if (!determineEnvironment(distro)) {
        context.skip()
      }
      // reuse the CI job's package manager selection when one is pinned; otherwise use the distro's primary one
      const pinnedPm = process.env.PACKAGE_MANAGER_TO_TEST
      const pm = pinnedPm == null || isEmptyOrSpaces(pinnedPm) ? pms[0] : pinnedPm
      if (!pms.includes(pm)) {
        context.skip()
      }
      await runInstallOnNextLaunchTest(context, target, pm, Arch.x64, {}, "explicit")
    })

    // Signed update manifests, one run per distro with the same package manager selection as above:
    // the manifest is verified before the package is downloaded, independent of the package manager used to install it.
    test(`${distro} - signed update manifest`, optionsForFlakyE2E, async (context: TestContext) => {
      if (!determineEnvironment(distro)) {
        context.skip()
      }
      const pinnedPm = process.env.PACKAGE_MANAGER_TO_TEST
      const pm = pinnedPm == null || isEmptyOrSpaces(pinnedPm) ? pms[0] : pinnedPm
      if (!pms.includes(pm)) {
        context.skip()
      }
      await runSignedManifestTest(context, target, pm, Arch.x64)
    })

    // Key rotation A → [A, B] → B over three builds, including manifests the installed app must refuse.
    test(`${distro} - key rotation`, optionsForFlakyMultiHopE2E, async (context: TestContext) => {
      if (!determineEnvironment(distro)) {
        context.skip()
      }
      const pinnedPm = process.env.PACKAGE_MANAGER_TO_TEST
      const pm = pinnedPm == null || isEmptyOrSpaces(pinnedPm) ? pms[0] : pinnedPm
      if (!pms.includes(pm)) {
        context.skip()
      }
      await runKeyRotationTest(context, target, pm, Arch.x64)
    })
  }
}
