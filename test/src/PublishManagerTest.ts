import { Platform } from "electron-builder"
import { app } from "./helpers/packTester"

const target = Platform.MAC.createTarget("zip")

test.ifDevOrLinuxCi("generic and github", app({
  targets: target,
  config: {
    publish: [
      {
        provider: "generic",
        url: "https://example.com/downloads"
      },
      {
        provider: "github",
        repo: "foo/foo"
      },
    ]
  },
}))