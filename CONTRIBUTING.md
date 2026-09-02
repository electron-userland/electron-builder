# Contributing to electron-builder

Thanks for taking the time to contribute — it genuinely helps push this project forward.

This project adheres to the [Contributor Covenant](http://contributor-covenant.org) code of conduct. By participating, you are expected to uphold this code. Please file an issue to report unacceptable behavior.

This repository is a **monorepo** made up of several published packages. Take a look at the [packages directory](https://github.com/electron-userland/electron-builder/tree/master/packages) to get oriented:

| Package | Purpose |
| --- | --- |
| `app-builder-lib` | Core build logic (targets, packaging, code signing) |
| `builder-util` / `builder-util-runtime` | Shared helpers (build-time / runtime) |
| `dmg-builder` | macOS DMG target |
| `electron-builder` | CLI entry point |
| `electron-builder-squirrel-windows` | Squirrel.Windows target |
| `electron-publish` | Publishers (GitHub, S3, Bitbucket, …) |
| `electron-updater` | Auto-update client |
| `electron-forge-maker-*` | Electron Forge maker adapters |

---

## Table of Contents

- [Contributing to electron-builder](#contributing-to-electron-builder)
  - [Table of Contents](#table-of-contents)
  - [Submitting a Pull Request](#submitting-a-pull-request)
    - [1. Prepare your branch](#1-prepare-your-branch)
    - [2. Build](#2-build)
    - [3. Add test coverage](#3-add-test-coverage)
    - [4. Run the relevant tests](#4-run-the-relevant-tests)
    - [5. Validate style, types, and generated files](#5-validate-style-types-and-generated-files)
    - [6. Generate a changeset](#6-generate-a-changeset)
    - [7. Open the PR](#7-open-the-pr)
    - [Quick reference](#quick-reference)
  - [Prerequisites](#prerequisites)
  - [Local Development Environment](#local-development-environment)
    - [Option A: `pnpm link` (recommended)](#option-a-pnpm-link-recommended)
    - [Option B: `yalc` (legacy)](#option-b-yalc-legacy)
  - [Running \& Debugging Tests](#running--debugging-tests)
    - [From the CLI](#from-the-cli)
    - [VS Code](#vs-code)
    - [IntelliJ IDEA / WebStorm](#intellij-idea--webstorm)
  - [Documentation](#documentation)
  - [Filing Issues](#filing-issues)

---

## Submitting a Pull Request

Work through these steps before you open a PR. Every command is run from the repository root unless noted otherwise.

### 1. Prepare your branch

Fork the repository, then branch off `master`:

```sh
git clone https://github.com/<your-username>/electron-builder.git
cd electron-builder
git checkout -b my-feature

corepack enable
pnpm install
```

### 2. Build

```sh
pnpm compile
```

For faster iteration while you work, run the watcher in a separate terminal:

```sh
pnpm compile:watch
```

> [!IMPORTANT]
> `pnpm compile` also regenerates the toolset test files (`pnpm ci:test:generate`); `pnpm compile:watch` only type-builds. Run a full `pnpm compile` at least once before your first test run.

> [!TIP]
> If you hit strange compilation errors, remove every `node_modules` directory in the project (especially under `packages/*`). `git clean -xfd` from the root is the simplest way — pre-validate what it will remove with the `--dry-run` flag first.

### 3. Add test coverage

New features and bug fixes need tests. Tests live under [`test/src`](https://github.com/electron-userland/electron-builder/tree/master/test/src) and mirror the area they cover.

### 4. Run the relevant tests

The full suite is very slow. Scope your run to the tests you touched with `TEST_FILES` (comma-separated, no file extension):

```sh
TEST_FILES=oneClickInstallerTest,assistedInstallerTest pnpm ci:test
```

Set `TEST_APP_TMP_DIR` to inspect the build output afterwards:

```sh
TEST_APP_TMP_DIR=/tmp/electron-builder-test TEST_FILES=oneClickInstallerTest pnpm ci:test
```

> [!WARNING]
> Every test shares that one directory and empties it on each run, so only set `TEST_APP_TMP_DIR` alongside a narrowly scoped `TEST_FILES` — ideally a single test. Set it for a broad run and parallel tests will clobber each other's output.

### 5. Validate style, types, and generated files

```sh
pnpm ci:validate
```

This runs dependency checks, ESLint, type-checking for both source and tests, regenerates the JSON schema, and applies Prettier. **Commit anything it regenerates** (most commonly `packages/app-builder-lib/scheme.json` and formatting fixes).

### 6. Generate a changeset

Releases are automated with [changesets](https://github.com/changesets/changesets). Any change that affects a **published package** needs a changeset — this is what produces the version bump and the changelog entry.

```sh
pnpm generate:changeset
```

The interactive prompt will ask you to:

1. **Select the packages you changed** — arrow keys to move, <kbd>space</kbd> to toggle, <kbd>enter</kbd> to confirm.
2. **Pick a bump type** for each package:

   | Bump | Use it for |
   | --- | --- |
   | `patch` | Bug fixes and internal changes with no API impact |
   | `minor` | New backwards-compatible features or config options |
   | `major` | Breaking changes — behavior changes users must react to |

3. **Write a summary.** This lands verbatim in the changelog, so write it for users, not reviewers. Lead with the conventional-commit type, describe the *after* (and *before* if needed), and for a `major` bump spell out the migration path.

This writes a new Markdown file into `.changeset/`. **Commit it with your change.**

Example `changeset`:
```markdown
---
"app-builder-lib": patch
---

fix: allow parentheses in AppImage executable, product, and license file names. Before, product names like `Zoo Design Studio (Staging)` failed AppImage builds with "productFilename contains characters that cannot be safely used in file paths". After, names containing `(` and `)` build again.
```

> [!NOTE]
> - Several packages are **linked** (see `.changeset/config.json`), so they are versioned together. Only select the packages you actually modified — changesets handles the rest.
> - Changes that ship nothing to users — repo tooling, CI config, tests, `website/docs`, this `CONTRIBUTING.md` file — don't need a changeset. Note that readmes and TSDoc comments **inside** `packages/*` are published, so those do.
> - Don't add an *empty* changeset (a file with no package block) to record such a change. `changeset version` consumes and deletes every changeset file during the release run, so an empty one is churn that produces nothing.
> - Never edit `package.json` versions or `CHANGELOG.md` by hand. Release automation owns both.

### 7. Open the PR

The **PR title** is validated by a [semantic PR check](https://github.com/amannn/action-semantic-pull-request) and must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <description>
```

Valid types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.

```
fix(nsis): retry batch file install on transient EBUSY
feat(publish): support Bitbucket access tokens
docs: fix broken configuration links
```

In the PR body, describe what you're trying to do, how you verified it, and link any related issues.

### Quick reference

```sh
pnpm install               # install dependencies
pnpm compile               # build + generate toolset tests (pnpm compile:watch for iteration)
TEST_FILES=<name> pnpm ci:test   # run scoped tests
pnpm ci:validate           # lint + typecheck + regenerate schema + prettier
pnpm generate:changeset    # create the changeset for your change
```

---

## Prerequisites

- **Node.js** `>=22.12.0`
- **pnpm** `>=11.1.0`

Use [corepack](https://nodejs.org/api/corepack.html) to activate the exact pnpm version pinned by this project:

```sh
corepack enable
```

---

## Local Development Environment

To test your changes against a real Electron app, link the local packages into that app.

Start by setting up the repo:

```sh
git clone https://github.com/electron-userland/electron-builder.git

pushd ./electron-builder
pnpm install
popd
```

### Option A: `pnpm link` (recommended)

Use [`pnpm link`](https://pnpm.io/cli/link) to point your project at your local checkout.

### Option B: `yalc` (legacy)

[yalc](https://github.com/whitecolor/yalc) publishes the packages to a local store that your other projects can install from.

```sh
npm i -g pnpm
pnpm i yalc -g
```

> [!NOTE]
> You may also need yarn — see [issue #6820](https://github.com/electron-userland/electron-builder/issues/6820) for details. Detailed reports are welcome.
>
> ```sh
> npm i -g yarn
> ```

**1. Publish to the local store.** Run these from `electron-builder/packages` — `yalc publish` cannot take multiple packages at once:

```sh
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

**2. Link them into your project.** Run this one-liner from your project folder:

```sh
yalc link app-builder-lib builder-util builder-util-runtime dmg-builder electron-builder electron-publish electron-builder-squirrel-windows electron-forge-maker-appimage electron-forge-maker-nsis electron-forge-maker-nsis-web electron-forge-maker-snap electron-updater
```

**3. Push changes after every edit.** This rebuilds electron-builder and patches the modules inside your project (e.g. `electron-quick-start`). The snippets assume the electron-builder repo sits next to your project folder — adjust the path otherwise.

<details>
<summary><b>bash / zsh</b></summary>

```sh
pushd ../electron-builder
pnpm compile
find packages/ -type d -maxdepth 1 -print0 | xargs -0 -L1 sh -c 'cd "$0" && yalc push'
popd
```

</details>

<details>
<summary><b>PowerShell</b> (Windows / VS Code)</summary>

```powershell
pushd ..\electron-builder
pnpm compile
Get-ChildItem packages -Directory | Foreach-Object{pushd "$_"; yalc push; popd;}
popd
```

</details>

<details>
<summary><b>cmd.exe</b> (Windows)</summary>

```batch
pushd ..\electron-builder
pnpm compile
for /D %d in (packages\*) do (pushd "%d" & yalc push & popd)
popd
```

</details>

---

## Running & Debugging Tests

Always run `pnpm compile` before executing tests — it generates the toolset test files as well as building. Keep `pnpm compile:watch` running afterwards for incremental rebuilds.

### From the CLI

```sh
pnpm compile
TEST_APP_TMP_DIR=/tmp/electron-builder-test TEST_FILES=oneClickInstallerTest,assistedInstallerTest,webInstallerTest pnpm ci:test
```

| Variable | Purpose |
| --- | --- |
| `TEST_FILES` | Comma-separated test filenames without extension (e.g. `oneClickInstallerTest`). Scopes the run — the full suite is very slow. |
| `TEST_APP_TMP_DIR` | Fixed directory for build output so you can inspect and use the test build. Used instead of a random temp directory and **emptied on each run**. Shared by every test — pair it with a single-test `TEST_FILES` only. |

### VS Code

`.vscode/launch.json` is committed to the repo and should auto-setup. Just make sure to run `pnpm compile` first (or keep `pnpm compile:watch` running in a separate terminal).

### IntelliJ IDEA / WebStorm

JetBrains IDEs support debugging via [ij-rc-producer](https://github.com/develar/ij-rc-producer) — click the green `Run` gutter icon next to a test.

To create a Node.js run configuration manually:

- Ensure `Before launch` contains `Compile TypeScript`.
- Set `Node interpreter` to a Node.js version matching the project requirement (`>=22.12.0`).
- To debug a single test, set `Application Parameters` to `-t "test name" relative-test-file-name`:
  ```
  -t "extraResources - one-package" globTest.js
  ```
- Under `Environment Variables`, optionally set `TEST_APP_TMP_DIR` (e.g. `/tmp/electron-builder-test`) to inspect output when a test uses a temporary directory.

---

## Documentation

Documentation source lives in [`website/docs`](https://github.com/electron-userland/electron-builder/tree/master/website/docs) and is built with [Docusaurus](https://docusaurus.io/). The site is deployed to Netlify. PRs get a preview deployment, but only for branches on the main repository — the preview workflow is skipped on forks, so preview your changes locally with `pnpm docs:dev`.

```sh
pnpm docs:dev        # local dev server with hot reload
pnpm docs:prebuild   # build the docker image used for the versioned site
pnpm docs:build      # build the full versioned site (docker)
pnpm docs:preview    # serve the built site
# or
pnpm docs:all        # prebuild + build
```

API reference pages under `website/docs/api/` are generated from `packages/*` with TypeDoc and are **not** committed (see `website/.gitignore`). Update the TSDoc comments in the source rather than editing those pages by hand.

---

## Filing Issues

When filing an issue, please make sure you give all the information needed:

- A description of what you're trying to do
- Your `package.json`
- Your electron-builder configuration
- The full terminal output / log
- Node.js version
- npm / pnpm / yarn version
- electron-builder version
