"use strict"

const Linter = require("tslint")
const path = require("path")

const configuration = {
  "extends": "tslint:recommended",
  "rules": {
    "member-ordering": [
      "static-before-instance",
      "variables-before-functions"
    ],
    "one-line": [
      true,
      "check-open-brace",
      "check-whitespace"
    ],
    "quotemark": [
      true,
      "double",
      "avoid-escape"
    ],
    "typedef-whitespace": [
      true,
      {
        "call-signature": "nospace",
        "index-signature": "nospace",
        "parameter": "nospace",
        "property-declaration": "nospace",
        "variable-declaration": "nospace"
      }
    ],
    "variable-name": [
      true,
      "ban-keywords"
    ],
    "ordered-imports": false,
    "semicolon": [true, "never"],
    "trailing-comma": false,
    "object-literal-sort-keys": false,
    "no-var-requires": false,
    "no-console": false,
    "max-line-length": false,
    "eofline": false,
    "comment-format": false,
    "no-conditional-assignment": false,
    "interface-name": false,
    "member-access": false,
    "no-shadowed-variable": false,
    "whitespace": [
      true,
      "check-branch",
      "check-decl",
      "check-operator",
      "check-separator",
      "check-type"
    ],
    "no-bitwise": false,
    "jsdoc-format": false,
    "no-for-in-array": true
  }
}
const options = {
  configuration: configuration,
}

for (let projectDir of [path.join(__dirname, ".."), path.join(__dirname, "..", "nsis-auto-updater"), __dirname]) {
  const program = Linter.createProgram("tsconfig.json", projectDir)
  for (let file of Linter.getFileNames(program)) {
    const fileContents = program.getSourceFile(file).getFullText()
    const linter = new Linter(file, fileContents, options, program)
    const out = linter.lint().output
    if (out.length > 0) {
      process.stdout.write(out)
    }
  }
}