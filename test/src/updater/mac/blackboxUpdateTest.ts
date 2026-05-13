import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests()
})
