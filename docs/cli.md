Execute `node_modules/.bin/electron-builder --help` (`node_modules/.bin/electron-builder build --help` for `build` subcommand) to get the actual CLI usage guide.

Since Node.js 8 [npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) is bundled, so, you can simply use `npx electron-builder`.

```
Commands:
  build                    Build                                       [default]
  install-app-deps         Install app deps
  node-gyp-rebuild         Rebuild own native code
  create-self-signed-cert  Create self-signed code signing cert for Windows apps
  start                    Run application in a development mode using
                           electron-webpack

Options:
  --help  Show help                               
```

## `electron-builder` (`build` command)

```
Building:
  --mac, -m, -o, --macos   Build for macOS, accepts target list (see
                           https://goo.gl/5uHuzj).                       [array]
  --linux, -l              Build for Linux, accepts target list (see
                           https://goo.gl/4vwQad)                        [array]
  --win, -w, --windows     Build for Windows, accepts target list (see
                           https://goo.gl/jYsTEJ)                        [array]
  --x64                    Build for x64                               [boolean]
  --ia32                   Build for ia32                              [boolean]
  --armv7l                 Build for armv7l                            [boolean]
  --dir                    Build unpacked dir. Useful to test.         [boolean]
  --extraMetadata, --em    Deprecated. Use -c.extraMetadata.
  --prepackaged, --pd      The path to prepackaged app (to pack in a
                           distributable format)
  --projectDir, --project  The path to project directory. Defaults to current
                           working directory.
  --config, -c             The path to an electron-builder config. Defaults to
                           `electron-builder.yml` (or `json`, or `json5`), see
                           https://goo.gl/YFRJOM

Publishing:
  --publish, -p  Publish artifacts (to GitHub Releases), see
                 https://goo.gl/tSFycD
                [choices: "onTag", "onTagOrDraft", "always", "never", undefined]

Deprecated:
  --platform  The target platform (preferred to use --mac, --win or --linux)
           [choices: "mac", "win", "linux", "darwin", "win32", "all", undefined]
  --arch      The target arch (preferred to use --x64 or --ia32)
                                      [choices: "ia32", "x64", "all", undefined]

Other:
  --help     Show help                                                 [boolean]
  --version

Examples:
  electron-builder -mwl                     build for macOS, Windows and Linux
  electron-builder --linux deb tar.xz       build deb and tar.xz for Linux
  electron-builder --win --ia32             build for Windows ia32
  electron-builder --em.foo=bar             set package.json property `foo` to
                                            `bar`
  electron-builder                          configure unicode options for NSIS
  --config.nsis.unicode=false

```

For other commands please see help using `--help` arg, e.g. `node_modules/.bin/electron-builder install-app-deps --help`