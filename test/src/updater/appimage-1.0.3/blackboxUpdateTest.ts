import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxLinuxTests } from "../blackboxUpdateLinuxSuite"

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxTests("1.0.3")
})
