import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// One mac blackbox auto-update case per file so the per-file CI sharder can spread these long e2e runs across shards
// (see registerBlackboxMacTests). The describe/test path is unchanged, so snapshot keys are the same as before the split.
// Ed25519-signed latest-mac.yml (runtime-generated key): the installed app verifies the manifest before updating.
describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_LINK != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("x64 - signed update manifest")
})
