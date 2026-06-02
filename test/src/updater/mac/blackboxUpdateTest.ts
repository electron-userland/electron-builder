import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_PASSWORD != null || process.env.CSC_IDENTITY_AUTO_DISCOVERY === "true")("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests()
})
