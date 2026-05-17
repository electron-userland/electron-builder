import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { registerAssistedInstallerTests } from "../assistedInstallerTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "0.0.0"

describe.ifWindows("assisted", () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerAssistedInstallerTests({ winCodeSign })
  })
})
