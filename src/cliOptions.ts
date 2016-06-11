import { underline } from "chalk"
import yargs = require("yargs")

export function createYargs(): any {
  return yargs
    .option("osx", {
      alias: "o",
      describe: "Build for OS X",
      type: "array",
    })
    .option("linux", {
      alias: "l",
      describe: "Build for Linux",
      type: "array",
    })
    .option("win", {
      alias: ["w", "windows"],
      describe: "Build for Windows",
      type: "array",
    })
    .option("x64", {
      describe: "Build for x64",
      type: "boolean",
    })
    .option("ia32", {
      describe: "Build for ia32",
      type: "boolean",
    })
    .option("publish", {
      alias: "p",
      describe: `Publish artifacts (to GitHub Releases), see ${underline("https://goo.gl/WMlr4n")}`,
      choices: ["onTag", "onTagOrDraft", "always", "never"],
    })
    .option("platform", {
      describe: "The target platform (preferred to use --osx, --win or --linux)",
      choices: ["osx", "win", "linux", "darwin", "win32", "all"],
    })
    .option("arch", {
      describe: "The target arch (preferred to use --x64 or --ia32)",
      choices: ["ia32", "x64", "all"],
    })
    .strict()
    .help()
    .version()
    .epilog(`Project home: ${underline("https://github.com/electron-userland/electron-builder")}`)
}
