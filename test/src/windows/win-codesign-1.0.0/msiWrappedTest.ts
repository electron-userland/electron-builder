import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { registerMsiWrappedTests } from "../msiWrappedTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "1.0.0"

describe.ifWindows("msiWrapped", { sequential: true }, () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerMsiWrappedTests({ winCodeSign })
  })
})
