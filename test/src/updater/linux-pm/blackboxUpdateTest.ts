import { registerBlackboxLinuxPackageManagerTests } from "../blackboxUpdateLinuxSuite"

// must be sequential in order for process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER to be respected per-test
// Linux Tests MUST be run in docker containers for proper ephemeral testing environment (e.g. fresh install + update + relaunch)
const optionsForFlakyE2E = { sequential: true, retry: 2 }

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxPackageManagerTests()
})
