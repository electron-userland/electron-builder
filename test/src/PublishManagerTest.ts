import { createTargets, Platform } from "electron-builder"
import { walk } from "electron-builder-util/out/fs"
import * as path from "path"
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

test.ifAll.ifNotWindows("os macro", app({
  targets: createTargets([Platform.LINUX, Platform.MAC], "zip"),
  config: {
    publish: {
      provider: "s3",
      bucket: "my bucket",
      // tslint:disable:no-invalid-template-strings
      path: "${channel}/${os}"
    }
  },
}, {
  publish: "always",
  projectDirCreated: async projectDir => {
    process.env.__TEST_S3_PUBLISHER__ = path.join(projectDir, "dist/s3")
  },
  packed: async context => {
    const dir = path.join(context.projectDir, "dist/s3")
    expect((await walk(dir, file => !path.basename(file).startsWith("."))).map(it => it.substring(dir.length + 1))).toMatchSnapshot()
  }
}))