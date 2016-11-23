import { underline } from "chalk"
import yargs from "yargs"

const publishGroup = "Publishing:"
const buildGroup = "Building:"
const deprecated = "Deprecated:"

export function createYargs(): any {
  //noinspection ReservedWordAsName
  return yargs
    .example("build -mwl", "build for macOS, Windows and Linux")
    .example("build --linux deb tar.xz", "build deb and tar.xz for Linux")
    .example("build --win --ia32", "build for Windows ia32")
    .example("build --em.foo=bar", "set application package.json property `foo` to `bar`")
    .option("mac", {
      group: buildGroup,
      alias: ["m", "o", "macos"],
      describe: `Build for macOS, accepts target list (see ${underline("https://goo.gl/HAnnq8")}).`,
      type: "array",
    })
    .option("linux", {
      group: buildGroup,
      alias: "l",
      describe: `Build for Linux, accepts target list (see ${underline("https://goo.gl/O80IL2")})`,
      type: "array",
    })
    .option("win", {
      group: buildGroup,
      alias: ["w", "windows"],
      describe: `Build for Windows, accepts target list (see ${underline("https://goo.gl/dL4i8i")})`,
      type: "array",
    })
    .option("x64", {
      group: buildGroup,
      describe: "Build for x64",
      type: "boolean",
    })
    .option("ia32", {
      group: buildGroup,
      describe: "Build for ia32",
      type: "boolean",
    })
    .option("armv7l", {
      group: buildGroup,
      describe: "Build for armv7l",
      type: "boolean",
    })
    .option("dir", {
      group: buildGroup,
      describe: "Build unpacked dir. Useful to test.",
      type: "boolean",
    })
    .option("publish", {
      group: publishGroup,
      alias: "p",
      describe: `Publish artifacts (to GitHub Releases), see ${underline("https://goo.gl/WMlr4n")}`,
      choices: ["onTag", "onTagOrDraft", "always", "never"],
    })
    .option("draft", {
      group: publishGroup,
      describe: "Create a draft (unpublished) release",
      type: "boolean",
      default: undefined,
    })
    .option("prerelease", {
      group: publishGroup,
      describe: "Identify the release as a prerelease",
      type: "boolean",
      default: undefined,
    })
    .option("platform", {
      group: deprecated,
      describe: "The target platform (preferred to use --mac, --win or --linux)",
      choices: ["mac", "win", "linux", "darwin", "win32", "all"],
    })
    .option("arch", {
      group: deprecated,
      describe: "The target arch (preferred to use --x64 or --ia32)",
      choices: ["ia32", "x64", "all"],
    })
    .option("extraMetadata", {
      alias: ["em"],
      group: buildGroup,
      describe: "Inject properties to application package.json (asar only)",
    })
    .strict()
    .group(["help", "version"], "Other:")
    .help()
    .version()
    .epilog(`See the Wiki (${underline("https://github.com/electron-userland/electron-builder/wiki")}) for more documentation.`)
}
