import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxLinuxPackageManagerTests } from "../blackboxUpdateLinuxSuite"

// must be sequential in order for process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER to be respected per-test
// Linux Tests MUST be run in docker containers for proper ephemeral testing environment (e.g. fresh install + update + relaunch)
// Use entrypoint script `<root>/test/src/updater/test-specific-platforms.sh`

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxPackageManagerTests()
})
