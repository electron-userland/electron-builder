import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// One mac blackbox auto-update case per file so the per-file CI sharder can spread these long e2e runs across shards
// (see registerBlackboxMacTests). The describe/test path is unchanged, so snapshot keys are the same as before the split.
// Squirrel.Mac only updates an arm64 build on an arm64 host, so this case is a no-op elsewhere.
describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("arm64")
})
