import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

const optionsForFlakyE2E = { sequential: true, retry: 0 }

describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests()
})
