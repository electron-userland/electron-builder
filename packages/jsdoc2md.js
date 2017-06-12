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
  ], {cwd: source})
  
  const appUpdateFiles = await globby([
    "updater/*.js",
    "!updater/electron-updater-out-electronHttpExecutor.js",
    "!updater/electron-updater-out-*Updater.js",
    "!updater/electron-updater-out-*Provider.js",
  ], {cwd: source})
  
  const publishOptionsFiles = await globby([
    "http/electron-builder-http-out-publishOptions.js",
  ], {cwd: source})

  const utilFiles = await globby([
    "util/**/*.js",
  ], {cwd: source})

  const coreFiles = await globby([
    "core/**/*.js",
  ], {cwd: source})

  const httpFiles = await globby([
    "http/**/*.js",
    "!http/electron-builder-http-out-publishOptions.js",
  ], {cwd: source})

  const publishFiles = await globby([
    "publisher/**/*.js",
  ], {cwd: source})

  const updaterFiles = await globby([
    "updater/electron-updater-out-electronHttpExecutor.js",
    "updater/electron-updater-out-*Updater.js",
    "updater/electron-updater-out-*Provider.js",
    "!updater/electron-updater-out-AppUpdater.js",
  ], {cwd: source})

  const developerFiles = (await globby([
    "builder/**/*.js",
    "!**/*-dirPackager.js",
    "!***/*-asarUtil.js",
    "!***/*-fileMatcher.js",
    "!***/*-fileTransformer.js",
    "!***/*-asar.js",
    "!***/*-archive.js",
    "!***/*-readInstalled.js",
    "!***/*-cliOptions.js",
    "!***/*-license.js",
    "!***/*-util-filter.js",
    "!***/*-yarn.js",
    "!***/*-dmgLicense.js",
    "!***/*-repositoryInfo.js",
    "!***/*-readPackageJson.js",
  ], {cwd: source}))
    .filter(it => !userFiles.includes(it))

  const partialDir = path.join(__dirname, "..", "jsdoc")
  const partials = (await globby(["*.hbs"], {cwd: partialDir})).map(it => path.resolve(partialDir, it))

  const pages = [
    {page: "Options.md", pageUrl: "Options", mainHeader: null, files: userFiles},
    {page: "api/electron-builder.md", pageUrl: "electron-builder", files: developerFiles},

    {page: "Auto Update.md", pageUrl: "Auto-Update", mainHeader: "API", files: appUpdateFiles},
    {page: "api/electron-updater.md", pageUrl: "electron-updater", files: updaterFiles},

    {page: "Publishing Artifacts.md", pageUrl: "Publishing-Artifacts", mainHeader: "API", files: publishOptionsFiles},
    {page: "api/electron-builder-util.md", pageUrl: "electron-builder-util", files: utilFiles},
    {page: "api/electron-builder-core.md", pageUrl: "electron-builder-core", files: coreFiles},
    {page: "api/electron-builder-http.md", pageUrl: "electron-builder-http", files: httpFiles},
    {page: "api/electron-publish.md", pageUrl: "electron-publish", files: publishFiles},
  ]

  await render(pages, {
    partial: partials,
    "name-format": true,
    "helper": [
      path.join(partialDir, "helpers.js")
    ],
  })
}

function sortOptions(pages) {
  function isOptionMember(member) {
    return member.name.endsWith("Options") || member.name === "Protocol" || member.name === "FileAssociation" || member.name === "AuthorMetadata" || member.name === "RepositoryInfo" || member.name === "FilePattern"
  }

  const filtered = []
  const excluded = new Set(["CommonLinuxOptions", "CommonNsisOptions", "LinuxTargetSpecificOptions", "PlatformSpecificBuildOptions", "ForgeOptions"])
  pages[0].data = pages[0].data.filter(member => {
    if (!excluded.has(member.name) && (isOptionMember(member) || member.kind === "module" || member.name === "Config" || member.name.startsWith("Metadata") || member.name.startsWith("Dmg"))) {
      return true
    }

    pages[0].dataMap.delete(member.id)
    pages[1].dataMap.set(member.id, member)

    filtered.push(member)
    return false
  })

  pages[0].data = pages[0].data.filter(member => {
    const isInlined = member.name.endsWith("MetadataDirectories") || member.id.includes(".Dmg") || isOptionMember(member)
    if (isInlined) {
      member.inlined = true
    }
    return !isInlined
  })

  pages[1].data = filtered.concat(pages[1].data)
  pages[1].data.unshift(pages[0].data[0])
}

function sortAutoUpdate(pages) {
  const pageIndex = 2

  const filtered = []
  const included = new Set(["AppUpdater", "UpdaterSignal"])
  pages[pageIndex].data = pages[pageIndex].data.filter(member => {
    if (member.kind === "module" || included.has(member.name)) {
      return true
    }
    const modulePrefix = "module:electron-updater."
    const parentClass = member.memberof
    if (member.kind === "function" && parentClass != null && parentClass.startsWith(modulePrefix) && included.has(parentClass.substring(modulePrefix.length))) {
      return true
    }

    pages[pageIndex].dataMap.delete(member.id)
    pages[pageIndex + 1].dataMap.set(member.id, member)

    filtered.push(member)
    return false
  })

  pages[pageIndex + 1].data = filtered.concat(pages[pageIndex + 1].data)
  pages[pageIndex + 1].data.unshift(pages[pageIndex].data[0])
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

  sortOptions(pages)
  sortAutoUpdate(pages)

  for (const page of pages) {
    const finalOptions = Object.assign({data: page.data, "property-list-format": page === pages[0] ? "list" : "table"}, jsdoc2MdOptions)

    if (page === pages[0]) {
      finalOptions["heading-depth"] = 1
    }

    let content = await jsdoc2md.render(finalOptions)

    if (page.mainHeader != null && content.startsWith("## Modules")) {
      content = "## API" + content.substring("## Modules".length)
    }
    if (page.mainHeader != null) {
      content = "## API" + content.substring(content.indexOf("\n", content.indexOf("##")))
    }
    if (page.mainHeader === null) {
      content = content.substring(content.indexOf("<a name=\"Config\"></a>"))
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