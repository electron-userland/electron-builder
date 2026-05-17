import { ToolsetConfig } from "app-builder-lib"
import { registerAppxTests } from "../appxTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "1.1.0"

describe.ifWindows("AppX", () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerAppxTests({ winCodeSign })
  })
})
