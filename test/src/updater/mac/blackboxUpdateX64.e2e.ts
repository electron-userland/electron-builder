import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// The x64 mac blackbox auto-update cases (plain update, Ed25519-signed latest-mac.yml, key rotation A → [A, B] → B), which share one set
// of three x64 builds (see registerBlackboxMacTests). One file per arch so the per-file CI sharder can spread the archs across shards.
// Requires a code-signing identity so Squirrel.Mac's old→new signature match succeeds. The test helpers provision an
// ephemeral self-signed identity on macOS (no Apple Developer membership needed; a real cert is also honored),
// so this always runs on mac.
describe.ifMac.heavy("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("x64")
})
