import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// One mac blackbox auto-update case per file so the per-file CI sharder can spread these long e2e runs across shards
// (see registerBlackboxMacTests). The describe/test path is unchanged, so snapshot keys are the same as before the split.
describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("x64")
})
