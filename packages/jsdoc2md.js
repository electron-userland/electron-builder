"use strict"

const globby = require("globby")
const path = require("path")
const fs = require("fs-extra-p")
const jsdoc2md = require("jsdoc-to-markdown")

async function main() {
  const source = path.join(__dirname, "..", "jsdoc", "out")
  const userFiles = await globby([
    "builder/electron-builder.js",
    "http/electron-builder-http-out-publishOptions.js",
    "publisher/electron-publish.js",
    "updater/*.js",
    "!updater/electron-updater-out-electronHttpExecutor.js",
    "!updater/electron-updater-out-*Updater.js",
    "!updater/electron-updater-out-*Provider.js",
    "updater/electron-updater-out-AppUpdater.js",
    "",
  ], {cwd: source, flipNegate: true})
  

  const developerFiles = (await globby([
    "**/*.js",
  ], {cwd: source, flipNegate: true}))
    .filter(it => !userFiles.includes(it))
  
  const partialDir = path.join(__dirname, "..", "jsdoc")
  const partials = (await globby(["*.hbs"], {cwd: partialDir})).map(it => path.resolve(partialDir, it))
  
  const defaultJsdoc2MdOptions = {
    partial: partials,
    "name-format": true,
    "helper": [
      path.join(partialDir, "property-link.js")
    ],
    separators: true,
  }
  
  function render(files) {
    return jsdoc2md.render(Object.assign({
      files: files.map(it => path.resolve(source, it)),
    }, defaultJsdoc2MdOptions))
  }
  
  let userContent = await render(userFiles)
  userContent = "## API" + userContent.substring("## Modules".length)
  await writeDocFile(path.join(__dirname, "..", "docs", "Options.md"), userContent)
  
  await writeDocFile(path.join(__dirname, "..", "docs", "Developer API.md"), await render(developerFiles))
}

async function writeDocFile(docOutFile, content) {
  let existingContent
  try {
    existingContent = await fs.readFile(docOutFile, "utf8")
  }
  catch (e) {
  }

  console.log(`Write doc to ${docOutFile}`)
  if (existingContent == null) {
    return fs.outputFile(docOutFile, content)
  }
  else {
    const startMarker = "<!-- do not edit. start of generated block -->"
    const endMarker = "<!-- end of generated block -->"
    const start = existingContent.indexOf(startMarker)
    const end = existingContent.indexOf(endMarker)
    if (start != -1 && end != -1) {
      return fs.outputFile(docOutFile, existingContent.substring(0, start + startMarker.length) + "\n" + content + "\n" + existingContent.substring(end))
    }
    else {
      return fs.outputFile(docOutFile, content)
    }
  }
}

(function () {
  main()
    .catch(error => {
      console.error((error.stack || error).toString())
      process.exit(-1)
    })
})()

  
// const configData = data.find(it => it.id === "module:electron-builder.Config")
//
// let result = {}
// for (const p of configData.properties) {
//   const typeNames = p.type.names.filter(it => it.startsWith("module:"))
//   if (typeNames.length != 1) {
//     continue
//   }
//
//   const namePath = typeNames[0]
//   result[p.name] = `[${namePath.substring(namePath.lastIndexOf(".") + 1)}](#${namePath.replace(":", "_")})`
// }
// console.log(JSON.stringify(result, null, 2))