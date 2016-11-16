You decided to contribute to this project? Great, thanks a lot for pushing it.

## Issues

When filing an issue please make sure, that you give all information needed.

This includes:

- description of what you're trying to do
- package.json
- config.json
- log of the terminal output
- node version
- npm version
- on which system do you want to create installers (macOS, Windows or Linux)

# Pull Requests
To check that your contributions match the project coding style make sure `npm test` passes.

[git-lfs](https://git-lfs.github.com) is required (use `git lfs pull` to download files when git-lfs was installed after git clone).

## Git Commit Guidelines
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

### Type
Must be one of the following:

* **feat**: A new feature.
* **fix**: A bug fix.
* **docs**: Documentation only changes.
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
* **refactor**: A code change that neither fixes a bug nor adds a feature.
* **perf**: A code change that improves performance.
* **test**: Adding missing tests.
* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation generation.

### Scope
The scope is optional and could be anything specifying place of the commit change. For example `nsis`, `mac`, `linux`, etc...

### Subject
The subject contains succinct description of the change:

* use the imperative, present tense: `change` not `changed` nor `changes`,
* don't capitalize first letter,
* no dot (.) at the end.

### Body
Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer
The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

A detailed explanation can be found in this [document](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit#).

# Documentation

Don't edit wiki directly. Instead, edit files in the `/docs`.

`/docs` is synced to wiki using git subtree merge when `next` release is marked as `latest` and available for all users.

# Debug Tests

Only IntelliJ Platform IDEs (IntelliJ IDEA, WebStorm) support debug. [Forked version of AVA](https://github.com/avajs/ava/pull/874) is used. Please see [AVA debug in the WebStorm](https://www.youtube.com/watch?v=C75UwuZXI98&feature=youtu.be).

Use one of the shared run configurations as a template and:

* Ensure that `Before launch` contains `Compile TypeScript` (note – currently do not add, please do`npm run compile` before run).
* Set `Node interpreter` to NodeJS 7. NodeJS 7 is required to debug.
* Set `Node parameters` to `--inspect`.
* Set `Application Parameters` to `--match="test name" relative-test-file-name` if you want to debug particular test. E.g.
  ```
  --match="extraResources - one-package" test/out/globTest.js
  ```
* Set `Environment Variables`:
  * `NODE_PATH` to `.`.
  * Optionally, `TEST_APP_TMP_DIR` to some directory (e.g. `/tmp/electron-builder-test`) to inspect output if test uses temporary directory (only if `--match` is used). Specified directory will be used instead of random temporary directory and *cleared* on each run.
  
## Run Test using CLI
```sh
TEST_APP_TMP_DIR=/tmp/electron-builder-test NODE_PATH=. ./node_modules/.bin/ava --match="boring" test/out/nsisTest.js
```

where `TEST_APP_TMP_DIR` is specified to easily inspect and use test build, `boring` is the test name and `test/out/nsisTest.js` is the path to test file.