import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { registerWinPackagerTests } from "../winPackagerTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "1.0.0"

describe(`winCodeSign: ${winCodeSign}`, () => {
  registerWinPackagerTests(winCodeSign)
})
