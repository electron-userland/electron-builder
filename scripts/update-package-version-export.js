const path = require("path")
const version = require(path.join(__dirname, "../packages/app-builder-lib/package.json")).version

const destFile = path.join(__dirname, '../packages/app-builder-lib/src/version.ts')

const { writeFileSync } = require("fs")
writeFileSync(destFile, `export const PACKAGE_VERSION = "${version}"
`)