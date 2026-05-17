import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxWinTests } from "../blackboxUpdateWinSuite"

describe(`winCodeSign: 0.0.0`, optionsForFlakyE2E, () => {
  registerBlackboxWinTests("0.0.0")
})
