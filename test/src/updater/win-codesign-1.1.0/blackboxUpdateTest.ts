import { optionsForFlakyE2E } from "../blackboxUpdateHelpers"
import { registerBlackboxWinTests } from "../blackboxUpdateWinSuite"

describe(`winCodeSign: 1.1.0`, optionsForFlakyE2E, () => {
  registerBlackboxWinTests("1.1.0")
})
