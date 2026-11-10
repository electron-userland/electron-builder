import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxLinuxPackageManagerTests } from "../blackboxUpdateLinuxSuite"

// must be sequential in order for process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER to be respected per-test
// Linux Tests MUST be run in docker containers for proper ephemeral testing environment (e.g. fresh install + update + relaunch)
// Use entrypoint script `<root>/test/src/updater/test-specific-platforms.sh`
// The immediate update per package manager; the other cases live in the sibling blackboxUpdateLinux*.e2e.ts files
// (see registerBlackboxLinuxPackageManagerTests) so the CI e2e matrix can run them in separate jobs.

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxPackageManagerTests("update")
})
