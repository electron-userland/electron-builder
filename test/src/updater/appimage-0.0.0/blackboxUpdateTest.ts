import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxLinuxTests } from "../blackboxUpdateLinuxSuite"

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxTests("0.0.0")
})
