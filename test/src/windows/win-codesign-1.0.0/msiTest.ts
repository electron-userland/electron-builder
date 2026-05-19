import { ToolsetConfig } from "app-builder-lib"
import { registerMsiTests } from "../msiTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "1.0.0"

describe.ifWindows("msi", { sequential: true }, () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerMsiTests({ winCodeSign })
  })
})
