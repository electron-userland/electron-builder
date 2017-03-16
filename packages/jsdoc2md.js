"use strict"

const globby = require("globby")
const path = require("path")
const fs = require("fs-extra-p")
const jsdoc2md = require("jsdoc-to-markdown")
const pathSorter = require("path-sort")
const source = path.join(__dirname, "..", "jsdoc", "out")

async function main() {
  const userFiles = await globby([
    "builder/electron-builder.js",
  ], {cwd: source, flipNegate: true})
  
  const appUpdateFiles = await globby([
    "updater/*.js",
    "!updater/electron-updater-out-electronHttpExecutor.js",
    "!updater/electron-updater-out-*Updater.js",
    "!updater/electron-updater-out-*Provider.js",
    "updater/electron-updater-out-AppUpdater.js",
    "",
  ], {cwd: source, flipNegate: true})
  
  const publishFiles = await globby([
    "http/electron-builder-http-out-publishOptions.js",
    "publisher/electron-publish.js",
  ], {cwd: source, flipNegate: true})
  
  const developerFiles = (await globby([
    "**/*.js",
  ], {cwd: source, flipNegate: true}))
    .filter(it => !userFiles.includes(it) && !appUpdateFiles.includes(it) && !publishFiles.includes(it))

  const partialDir = path.join(__dirname, "..", "jsdoc")
  const partials = (await globby(["*.hbs"], {cwd: partialDir})).map(it => path.resolve(partialDir, it))

  const pages = [
    {page: "Options.md", pageUrl: "Options", mainHeader: "API", files: userFiles},
    {page: "Auto Update.md", pageUrl: "Auto-Update", mainHeader: "API", files: appUpdateFiles},
    {page: "Publishing Artifacts.md", pageUrl: "Publishing-Artifacts", mainHeader: "API", files: publishFiles},
    {page: "Developer API.md", pageUrl: "Developer-API", files: developerFiles},
  ]

  await render(pages, {
    partial: partials,
    "name-format": true,
    "helper": [
      path.join(partialDir, "helpers.js")
    ],
  })
}

async function render(pages, jsdoc2MdOptions) {
  require(path.join(__dirname, "..", "jsdoc", "helpers.js")).pages = pages

  for (const page of pages) {
    page.data = await jsdoc2md.getTemplateData(Object.assign({
      files: pathSorter(page.files).map(it => path.resolve(source, it)),
    }, jsdoc2MdOptions))

    const map = new Map()
    for (const member of page.data) {
      map.set(member.id, member)
    }

    page.dataMap = map
  }

  for (const page of pages) {
    let content = await jsdoc2md.render(Object.assign({
      data: page.data,
    }, jsdoc2MdOptions))

    if (page.mainHeader != null && content.startsWith("## Modules")) {
      content = "## API" + content.substring("## Modules".length)
    }
    if (page.mainHeader != null) {
      content = "## API" + content.substring(content.indexOf("\n", content.indexOf("##")))
    }

    await writeDocFile(path.join(__dirname, "..", "docs", page.page), content)
  }
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