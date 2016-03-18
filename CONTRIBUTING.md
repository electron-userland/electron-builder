# electron-builder

You decided to contribute to this project? Great, thanks a lot for pushing it.

Before you file an issue or make a pull request please check these points:

## Needed issue information

When filing an issue please make sure, that you give all information needed.

This includes:

- description of what you're trying to do
- package.json
- config.json
- log of the terminal output
- node version
- npm version
- on which system do you want to create installers (Win/MacOS,Linux)

## Pull requests notes

### Editor settings
- please set up your editor to use two spaces
- remove spaces at line endings or empty lines
- make sure all files end with one empty line

### Coding style

#### I really like spaces, because I think they improve the readability a lot. Please try to keep that in mind.

To check that your contributions match the given coding style make sure `npm test` passes.
We use [ESLint](http://eslint.org/) to guarantee a consistent coding style.

#### Please try to stick to line max character number of 80.

I know that it is sometimes unavoidable to go over it. But function arguments and long if-conditions can include line breaks. ;)

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
The scope is optional and could be anything specifying place of the commit change. For example `nsis`, `osx`, `linux`, etc...

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

# Publishing to NPM
We use [semantic-release](https://github.com/semantic-release/semantic-release) to fully automate package publishing.
Every successful continuous integration build of the master branch is analyzed and
new version will be published if `fix`, `feat` or `BREAKING CHANGE` [detected](https://github.com/semantic-release/semantic-release#patch-release).