You decided to contribute to this project? Great, thanks a lot for pushing it.

This project adheres to the [Contributor Covenant](http://contributor-covenant.org) code of conduct.
By participating, you are expected to uphold this code. Please file an issue to report unacceptable behavior.

This repository has a mono-repo structure consisting of multiple packages. Try to take a look at the [packages directory](https://github.com/electron-userland/electron-builder/tree/master/packages)!

## Prerequisites

- **Node.js >=22.12.0** is required. A `.nvmrc` file at the repo root pins the recommended dev version — run `nvm use` or `fnm use` to activate it.
- [pnpm](https://pnpm.js.org) >=11.1.0 is required. Use `corepack` to activate the correct version for this project.

## To setup a local dev environment

Follow this chapter to setup an environment from scratch.

```
git clone https://github.com/electron-userland/electron-builder.git

pushd ./electron-builder
pnpm install
popd
```

## Linking packages for local development

### Recommended: pnpm link

Use [pnpm link](https://pnpm.io/cli/link) to develop against your local electron-builder changes without publishing:

```sh
# From within the package you changed (e.g., packages/app-builder-lib):
pnpm link --global

# From your consumer project:
pnpm link --global app-builder-lib
```

After changing source files, rebuild with `pnpm compile` (or `pnpm compile --watch`) and the linked package will reflect the changes.

### Legacy: yalc

[yalc](https://github.com/whitecolor/yalc) is an alternative if you prefer it. Install globally first:

```
npm i -g yalc
```

Publish packages to yalc's local store (run from `electron-builder/packages`):

```
yalc publish app-builder-lib
yalc publish builder-util
yalc publish builder-util-runtime
yalc publish dmg-builder
yalc publish electron-builder
yalc publish electron-publish
yalc publish electron-builder-squirrel-windows
yalc publish electron-forge-maker-appimage
yalc publish electron-forge-maker-nsis
yalc publish electron-forge-maker-nsis-web
yalc publish electron-forge-maker-snap
yalc publish electron-updater
```

Link them to your consumer project:

```
yalc link app-builder-lib builder-util builder-util-runtime dmg-builder electron-builder electron-publish electron-builder-squirrel-windows electron-forge-maker-appimage electron-forge-maker-nsis electron-forge-maker-nsis-web electron-forge-maker-snap electron-updater
```

Rebuild and push after changes (run from repo root):

```sh
pnpm compile
find packages/ -type d -maxdepth 1 -print0 | xargs -0 -L1 sh -c 'cd "$0" && yalc push'
```

PowerShell equivalent:

```PowerShell
pnpm compile
Get-ChildItem packages -Directory | Foreach-Object{pushd "$_"; yalc push; popd;}
```

## Pull Requests

To check that your contributions match the project coding style make sure `pnpm ci:validate` passes.
To build project run: `pnpm i && pnpm compile` (add `--watch` for faster dev iteration)

> If you get strange compilation errors, try to remove all `node_modules` directories in the project (especially under `packages/*`). `git clean -xfd` from root is a simple method; pre-validate via `--dry-run` first.

### Build process

`pnpm compile` runs a two-phase staged build to respect inter-package dependency order:

1. **Phase 1** (sequential): `builder-util-runtime` → `builder-util` → `electron-publish` → `app-builder-lib`
2. **Phase 2** (parallel): `dmg-builder`, `electron-builder-squirrel-windows`, `electron-updater`, `electron-builder`

If you touch a core package (`builder-util`, `app-builder-lib`, etc.), run a full `pnpm compile` before running tests so downstream packages pick up your changes.

### ESM

All packages are native ESM (`"type": "module"`). When adding imports in TypeScript source files, use explicit `.js` extensions even though the source file is `.ts`:

```ts
import { something } from "./myModule.js"  // correct
import { something } from "./myModule"     // will break at runtime
```

Tests run against TypeScript sources directly via Vitest path aliases — no compile step is needed before running tests. Internal APIs not exported from the main package surface are accessible in tests via the `./internal` subpath export (e.g., `import { x } from "app-builder-lib/internal"`).

### Git Commit Guidelines

We use [semantic-release](https://github.com/semantic-release/semantic-release), so we have very precise rules over how our git [commit messages can be formatted](https://gist.github.com/develar/273e2eb938792cf5f86451fbac2bcd51).

## Documentation

Documentation files located in the `/pages`.

`/docs` is deployed to Netlify on every release and available for all users.

Build commands:
```
pnpm docs:prebuild # docker image
pnpm docs:prebuild
pnpm docs:mkdocs
pnpm docs:preview # (optional) open in browser
```

## Debug Tests

### IntelliJ

IntelliJ Platform IDEs ([IntelliJ IDEA](https://confluence.jetbrains.com/display/IDEADEV/IDEA+2017.1+EAP),
[WebStorm](https://confluence.jetbrains.com/display/WI/WebStorm+EAP)) support debug.

If you use IntelliJ IDEA or WebStorm — [ij-rc-producer](https://github.com/develar/ij-rc-producer) is used and you
can run tests from an editor (just click on `Run` green gutter icon).

Or you can create the Node.js run configuration manually:

- Ensure that `Before launch` contains `Compile TypeScript`.
- Set `Node interpreter` to Node.js >=22.12.0.
- Set `Application Parameters` to `-t "test name" relative-test-file-name` if you want to debug particular test. E.g.
  ```
  -t "extraResources - one-package" globTest.js
  ```
- Set `Environment Variables`:
  - Optionally, `TEST_APP_TMP_DIR` to a directory inside the repo (e.g., `./temp/electron-builder-test`) to inspect output if test
    uses temporary directory (only if `--match` is used). Specified directory will be used instead of random
    temporary directory and _cleared_ on each run.

### VSCode

Config is committed to the repo, it should auto-setup. Just make sure to run `pnpm compile` first (or `pnpm compile --watch` in a separate terminal)

### Run Test using CLI

```sh
TEST_APP_TMP_DIR=./temp/electron-builder-test TEST_FILES=oneClickInstallerTest,assistedInstallerTest,webInstallerTest pnpm ci:test
```

where `TEST_APP_TMP_DIR` is specified to easily inspect and use test build, `oneClickInstallerTest` is the test filename

## Issues

When filing an issue please make sure, that you give all information needed.

This includes:

- description of what you're trying to do
- `package.json`
- log of the terminal output
- node version
- npm version
- electron-builder config
