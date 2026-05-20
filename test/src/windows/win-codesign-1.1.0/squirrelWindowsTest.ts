import { ToolsetConfig } from "app-builder-lib"
import { registerSquirrelWindowsTests } from "../squirrelWindowsTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "1.1.0"

describe.ifWindows("squirrel-windows", { sequential: true }, () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerSquirrelWindowsTests({ winCodeSign })
  })
})
