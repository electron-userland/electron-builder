import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// The arm64 mac blackbox auto-update cases (plain update; the request rules of electron-updater 7: crossOriginHeaders, plain http feeds
// and their redirects, the declared size of a full download; Ed25519-signed latest-mac.yml; key rotation A → [A, B] → B), which share one
// arm64 build and the versions derived from it (see registerBlackboxMacTests). Only updates on an arm64 mac host (skipped elsewhere).
// Requires a code-signing identity so Squirrel.Mac's old→new signature match succeeds. The test helpers provision an
// ephemeral self-signed identity on macOS (no Apple Developer membership needed; a real cert is also honored),
// so this always runs on mac.
describe.ifMac.heavy("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests("arm64")
})
