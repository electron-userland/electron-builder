import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { APPIMAGE_VERSIONS, latestToolsetVersion } from "../../vitest-scripts/runtime-tests/generate-toolset-versions"
import { optionsForFlakyMultiHopE2E } from "./blackboxUpdateHelpers"
import { runAppImageRequestRulesTest } from "./blackboxUpdateRuntimeChecks"

// The request rules of electron-updater 7 and the modes of the install at launch on a real AppImage update (see
// runAppImageRequestRulesTest), with the newest appimage toolset only: the toolset takes no part in them. Runs in the AppImage docker image
// of the "Test e2e Auto Updater Linux" job appimage-update-rules (`./test/src/updater/test-specific-platforms.sh appimage`), for the host arch.
const arch = process.arch === "arm64" ? Arch.arm64 : Arch.x64

describe.heavy.ifLinux("linux", optionsForFlakyMultiHopE2E, () => {
  test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true")(
    `AppImage - update request rules and install modes - ${Arch[arch]}`,
    optionsForFlakyMultiHopE2E,
    async (context: TestContext) => {
      await runAppImageRequestRulesTest(context, arch, { appimage: latestToolsetVersion(APPIMAGE_VERSIONS) })
    }
  )
})
