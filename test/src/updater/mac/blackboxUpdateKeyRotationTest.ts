import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// One mac blackbox auto-update case per file so the per-file CI sharder can spread these long e2e runs across shards
// (see registerBlackboxMacTests). The describe/test path is unchanged, so snapshot keys are the same as before the split.
// Key rotation A → [A, B] → B over three builds, including manifests the installed app must refuse.
describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("x64 - key rotation")
})
