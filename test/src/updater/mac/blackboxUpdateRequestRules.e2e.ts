import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// One mac blackbox auto-update case per file so the per-file CI sharder can spread these long e2e runs across shards
// (see registerBlackboxMacTests). The request rules of electron-updater 7 (crossOriginHeaders, plain http feeds and their
// redirects, the declared size of a full download) on a real Squirrel.Mac update. Only updates on an arm64 mac host (skipped elsewhere).
// Requires a code-signing identity so Squirrel.Mac's old→new signature match succeeds. The test helpers provision an
// ephemeral self-signed identity per build on macOS (no Apple Developer membership needed; a real cert is also honored),
// so this always runs on mac.
describe.ifMac.heavy("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("arm64 - update request rules")
})
