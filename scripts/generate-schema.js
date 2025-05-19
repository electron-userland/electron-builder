const fs = require("fs")
const path = require("path")

const basePath = path.join(__dirname, "../packages/app-builder-lib")
const schemaFile = path.join(basePath, "scheme.json")
const configPath = path.join(basePath, "tsconfig-scheme.json")

const tsj = require("ts-json-schema-generator")

/** @type {import('ts-json-schema-generator/dist/src/Config').Config} */
const config = {
  tsconfig: configPath,
  type: "Configuration",
}

const schema = tsj.createGenerator(config).createSchema(config.type)

const schemaString = JSON.stringify(schema, null, 2)
fs.writeFile(schemaFile, schemaString, err => {
  if (err) throw err
})
