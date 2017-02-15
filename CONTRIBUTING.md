You decided to contribute to this project? Great, thanks a lot for pushing it.

## Pull Requests
To check that your contributions match the project coding style make sure `npm test` passes.

1. [yarn](https://yarnpkg.com) is required because NPM is not reliable.
2. [git-lfs](https://git-lfs.github.com) is required (use `git lfs pull` to download files when git-lfs was installed after git clone).

To build project: `yarn && yarn compile`

If you get strange compilation errors, try to remove all `node_modules` in the project (especially under `packages/*`).

### Git Commit Guidelines
We use [semantic-release](https://github.com/semantic-release/semantic-release), so we have very precise rules over how our git commit messages can be formatted.

The commit message formatting can be added using a typical git workflow or through the use of a CLI wizard ([Commitizen](https://github.com/commitizen/cz-cli)).
To use the wizard, run `npm run commit` in your terminal after staging your changes in git.

### Commit Message Format
Each commit message consists of a **header**, a **body** and a **footer**.  The header has a special
format that includes a **type**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

Example — `fix: remove unused dependency lodash.camelcase`

Any line of the commit message cannot be longer 100 characters. This allows the message to be easier to read on GitHub as well as in various git tools.

#### Type
Must be one of the following:

* **feat**: A new feature.
* **fix**: A bug fix.
* **docs**: Documentation only changes.
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
* **refactor**: A code change that neither fixes a bug nor adds a feature.
* **perf**: A code change that improves performance.
* **test**: Adding missing tests.
* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation generation.

#### Scope
The scope is optional and could be anything specifying place of the commit change. For example `nsis`, `mac`, `linux`, etc...

#### Subject
The subject contains succinct description of the change:

* use the imperative, present tense: `change` not `changed` nor `changes`,
* don't capitalize first letter,
* no dot (.) at the end.

#### Body
Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

#### Footer
The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

A detailed explanation can be found in this [document](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit#).

## Documentation

Don't edit wiki directly. Instead, edit files in the `/docs`.

`/docs` is synced to wiki using git subtree merge when `next` release is marked as `latest` and available for all users.

## Debug Tests

Only IntelliJ Platform IDEs ([IntelliJ IDEA](https://confluence.jetbrains.com/display/IDEADEV/IDEA+2017.1+EAP), [WebStorm](https://confluence.jetbrains.com/display/WI/WebStorm+EAP)) support debug. Please prefer to use 2017.1.

If you use IntelliJ IDEA or WebStorm 2017.1 — [ij-rc-producer](https://github.com/develar/ij-rc-producer) is used and you can run tests from an editor.

Or you can create Node.js run configuration manually:
* Ensure that `Before launch` contains `Compile TypeScript`.
* Set `Node interpreter` to NodeJS 7. NodeJS 7 is required to debug.
* Set `Application Parameters` to `-t "test name" relative-test-file-name` if you want to debug particular test. E.g.
  ```
  -t "extraResources - one-package" globTest.js
  ```
* Set `Environment Variables`:
  * Optionally, `TEST_APP_TMP_DIR` to some directory (e.g. `/tmp/electron-builder-test`) to inspect output if test uses temporary directory (only if `--match` is used). Specified directory will be used instead of random temporary directory and *cleared* on each run.
  
### Run Test using CLI
```sh
TEST_APP_TMP_DIR=/tmp/electron-builder-test ./node_modules/.bin/jest --env jest-environment-node-debug -t 'boring' '/oneClickInstallerTest\.\w+$'
```

where `TEST_APP_TMP_DIR` is specified to easily inspect and use test build, `boring` is the test name and `/oneClickInstallerTest\.\w+$` is the path to test file.

Do not forget to execute `yarn compile` before run.

## Issues

When filing an issue please make sure, that you give all information needed.

This includes:

- description of what you're trying to do
- package.json
- log of the terminal output
- node version
- npm version
- on which system do you want to create installers (macOS, Linux or Windows).