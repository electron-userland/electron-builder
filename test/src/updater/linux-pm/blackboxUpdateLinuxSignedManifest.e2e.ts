import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxLinuxPackageManagerTests } from "../blackboxUpdateLinuxSuite"

// One Linux package-manager blackbox case per file so the CI e2e matrix can run these long cases in separate jobs
// (see registerBlackboxLinuxPackageManagerTests). The describe/test path is unchanged, so snapshot keys are the same as
// before the split. Run in the distro docker images via `<root>/test/src/updater/test-specific-platforms.sh`.
describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxPackageManagerTests("signed update manifest")
})
