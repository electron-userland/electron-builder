import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxMacTests } from "../blackboxUpdateMacSuite"

// Requires a code-signing identity so Squirrel.Mac's old→new signature match succeeds. The vitest
// globalSetup provisions an ephemeral self-signed identity on macOS (CSC_KEY_PASSWORD), so this now runs
// without an Apple Developer membership; a real cert is also honored.
describe.ifMac.heavy.ifEnv(process.env.CSC_KEY_PASSWORD != null)("mac", optionsForFlakyE2E, () => {
  registerBlackboxMacTests()
})
