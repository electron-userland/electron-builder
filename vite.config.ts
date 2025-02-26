import { defineConfig } from "vitest/config"
import fs from "fs"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test"]
  const includeRegex = `(${testRegex.join("|")})`
  console.log("TEST_FILES pattern", includeRegex)

  const isWindows = process.platform === "win32"

  return defineConfig({
    server: {
      https: {
        cert: fs.readFileSync("./.vitest-cert/cert.pem"),
        key: fs.readFileSync("./.vitest-cert/key.pem"),
      },
    },
    test: {
      // if using `toMatchSnapshot`, it MUST be passed in through the test context
      // e.g. test("name", ({ expect }) => { ... })
      globals: true,

      setupFiles: "./test/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",

      name: "node",
      environment: "node",

      server: {
        deps: {
          inline: ["electron"],
        },
      },

      deps: {
        optimizer: {
          web: {
            enabled: true,
          },
        },
      },

      sequence: {
        concurrent: true
      },
      
      // // Speed things up a bit -- these help but probably won't be needed someday
      // maxConcurrency: 20,
      // pool: "forks",
      // poolOptions: {
      //   forks: {
      //     isolate: false,
      //   },
      // },
      // isolate: false, // only safe with the poolOptions above

      slowTestThreshold: 10 * 1000,
      testTimeout: (isWindows ? 8 : 6) * 1000 * 60, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware
      coverage: {
        reporter: ["lcov", "text"],
      },
      reporters: ["default", "html"],
      outputFile: "coverage/sonar-report.xml",
      snapshotFormat: {
        printBasicPrototype: false,
      },
      resolveSnapshotPath: (testPath, snapshotExtension) => {
        return testPath
          .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
          .replace("/src/", "/snapshots/")
          .replace("\\src\\", "\\snapshots\\")
      },
    },
  })
}
