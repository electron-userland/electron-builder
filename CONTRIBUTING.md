You decided to contribute to this project? Great, thanks a lot for pushing it.

This project adheres to the [Contributor Covenant](http://contributor-covenant.org) code of conduct. 
By participating, you are expected to uphold this code. Please file issue to report unacceptable behavior.

## Prerequisites
> All prerequisites could be installed via script at the end of the chapter
>

* [pnpm](https://pnpm.js.org) is required because NPM is not reliable and Yarn 2 is not as good as PNPM.
* For local development, you can use [yalc](https://github.com/whitecolor/yalc) in order to apply changes made to 
electron-builder for your other projects to leverage and test with.
```
npm install -g pnpm
pnpm i yalc -g
```

## To setup a local dev environment
Follow this chapter to setup an environment from scratch.
```
git clone https://github.com/electron-userland/electron-builder.git

pushd ./electron-builder
pnpm install
popd
```

You must link `yalc`'s local "packages" to your project via the one-liner below (run from your project folder)
```
yalc link app-builder-lib builder-util builder-util-runtime dmg-builder electron-builder electron-publish electron-builder-squirrel-windows electron-forge-maker-appimage electron-forge-maker-nsis electron-forge-maker-nsis-web electron-forge-maker-snap electron-updater
```

The magical script for whenever you make changes to electron-builder! Rebuilds electron-builder, and then patches 
the npm modules in your project (such as `electron-quick-start`).
Ready for copy-paste into terminal presuming electron-builder repo is at root level outside your project folder, 
otherwise adjust path as necessary.
```
pushd ../electron-builder
pnpm compile
find packages/ -type d -maxdepth 1 -print0 | xargs -0 -L1 sh -c 'cd "$0" && yalc push'
popd
```

On Windows cmd.exe:
```batch
pushd ..\electron-builder
pnpm compile
for /D %d in (packages\*) do (pushd "%d" & yalc push & popd)  
popd
```

## Pull Requests
To check that your contributions match the project coding style make sure `pnpm test` passes.
To build project run: `pnpm i && pnpm compile`

> If you get strange compilation errors, try to remove all `node_modules` directories in the project (especially under `packages/*`).
>
### Git Commit Guidelines
We use [semantic-release](https://github.com/semantic-release/semantic-release), so we have very precise rules over how 
our git [commit messages can be formatted](https://gist.github.com/develar/273e2eb938792cf5f86451fbac2bcd51).

## Documentation

Documentation files located in the `/docs`.

`/docs` is deployed to Netlify on every release and available for all users.

`bash netlify-docs.sh` to setup local env (Python 3) and build.

Build command: `mkdocs build`.

## Debug Tests

Only IntelliJ Platform IDEs ([IntelliJ IDEA](https://confluence.jetbrains.com/display/IDEADEV/IDEA+2017.1+EAP), 
[WebStorm](https://confluence.jetbrains.com/display/WI/WebStorm+EAP)) support debug.

If you use IntelliJ IDEA or WebStorm — [ij-rc-producer](https://github.com/develar/ij-rc-producer) is used and you 
can run tests from an editor (just click on `Run` green gutter icon).

Or you can create the Node.js run configuration manually:
* Ensure that `Before launch` contains `Compile TypeScript`.
* Set `Node interpreter` to NodeJS 8. NodeJS 8 is required to debug.
* Set `Application Parameters` to `-t "test name" relative-test-file-name` if you want to debug particular test. E.g.
  ```
  -t "extraResources - one-package" globTest.js
  ```
* Set `Environment Variables`:
  * Optionally, `TEST_APP_TMP_DIR` to some directory (e.g. `/tmp/electron-builder-test`) to inspect output if test 
  uses temporary directory (only if `--match` is used). Specified directory will be used instead of random 
  temporary directory and *cleared* on each run.

### Run Test using CLI
```sh
pnpm compile
TEST_APP_TMP_DIR=/tmp/electron-builder-test ./node_modules/.bin/jest --env jest-environment-node-debug -t 'assisted' '/oneClickInstallerTest\.\w+$'
```
where `TEST_APP_TMP_DIR` is specified to easily inspect and use test build, `assisted` is the test name 
and `/oneClickInstallerTest\.\w+$` is the path to test file.


## Issues

When filing an issue please make sure, that you give all information needed.

This includes:

- description of what you're trying to do
- `package.json`
- log of the terminal output
- node version
- npm version
- on which system do you want to create installers (macOS, Linux or Windows).
