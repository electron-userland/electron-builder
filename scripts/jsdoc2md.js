"use strict"

require("source-map-support").install()

const globby = require("globby")
const path = require("path")
const fs = require("fs-extra-p")
const jsdoc2md = require("jsdoc-to-markdown")
const pathSorter = require("path-sort")
const source = path.join(__dirname, "jsdoc", "out")

async function main() {
  const httpFiles = await globby([
    "http/**/*.js",
    "!http/electron-builder-http-out-publishOptions.js",
    "!http/electron-builder-http-out-updateInfo.js",
  ], {cwd: source})

  const partialDir = path.join(__dirname, "jsdoc")
  const partials = (await globby(["*.hbs"], {cwd: partialDir})).map(it => path.resolve(partialDir, it))

  const pages = [
    {
      page: "api/electron-builder.md", pageUrl: "electron-builder",
      files: [
        path.join(source, "util/builder-util.js"),
        path.join(source, "builder/electron-builder.js"),
      ]
    },

    {
      page: "auto-update.md", pageUrl: "auto-update", mainHeader: "API",
      files: [
        path.join(source, "updater/electron-updater.js"),
        path.join(source, "http/electron-builder-http-out-updateInfo.js"),
      ]
    },
  ]

  const jsdoc2MdOptions = {
    partial: partials,
    "name-format": true,
    "helper": [
      path.join(partialDir, "helpers.js")
    ],
  }
  await render(pages, jsdoc2MdOptions)

  await render2([
    path.join(source, "builder", "electron-builder.js"),
    path.join(source, "http", "electron-builder-http-out-publishOptions.js")
  ], jsdoc2MdOptions)
}

async function render2(files, jsdoc2MdOptions) {
  const data = await jsdoc2md.getTemplateData(Object.assign({
    files: pathSorter(files).map(it => path.resolve(source, it)),
  }, jsdoc2MdOptions))

  const dataMap = new Map()
  for (const member of data) {
    if (member.name.endsWith("MetadataDirectories") || isInlinedMember(member)) {
      member.inlined = true
    }

    dataMap.set(member.id, member)
  }

  const { Renderer, TypeNamePlace, Page } = require("./renderer/out/main")
  const renderer = new Renderer(dataMap)

  const blockedPropertyName = new Set([
    "fileAssociations", "directories", "buildVersion", "mac", "linux", "win", "buildDependenciesFromSource", "afterPack",
    "installerIcon", "include", "createDesktopShortcut", "displayLanguageSelector",
  ])
  renderer.isInsertHorizontalLineBefore = item => {
    return blockedPropertyName.has(item.name)
  }

  const originalRenderTypeName = renderer.renderTypeName
  renderer.renderTypeName = context => {
    if (context.place === TypeNamePlace.INHERITED_FROM) {
      // no need to include big PlatformSpecificBuildOptions to mac/win/linux docs
      if (context.typeItem.name === "PlatformSpecificBuildOptions") {
        return null
      }

      // looks strange when on LinuxConfiguration page "Inherited from `CommonLinuxOptions`:" - no configuration inheritance in this case
      if (context.object.name === "LinuxConfiguration" || (context.object.name === "NsisOptions" && context.typeItem.name === "CommonNsisOptions")) {
        return ""
      }
    }

    let types = context.types
    if (types == null) {
      types = [context.typeItem.id]
    }

    if (context.property != null && context.property.name === "publish") {
      return "The [publish](/configuration/publish.md) options."
    }

    if (context.place === TypeNamePlace.PROPERTY) {
      if (types.some(it => it.includes(".FileSet"))) {
        const propertyName = context.property.name
        let label = "files"
        if (propertyName === "extraResources") {
          label = "extra resources"
        }
        if (propertyName === "extraFiles") {
          label = "extra files"
        }
        return `The [${label}](/configuration/contents.md#${propertyName.toLowerCase()}) configuration.`
      }
    }

    if (types.some(it => it.endsWith("TargetConfiguration"))) {
      return "String | [TargetConfiguration](target.md#targetconfiguration)"
    }
    if (types.some(it => it.endsWith(".Configuration") || it === "Configuration")) {
      // description contains link to.
      return "[Configuration](#configuration)"
    }
    if (types.some(it => it.endsWith("GithubOptions"))) {
      // description contains link to.
      return ""
    }

    if (types.some(it => it.endsWith("WindowsConfiguration"))) {
      return "[WindowsConfiguration](win.md)"
    }
    if (types.some(it => it.endsWith(".NsisOptions") || it === "NsisOptions")) {
      return "[NsisOptions](nsis.md)"
    }
    if (types.some(it => it.endsWith("AppXOptions"))) {
      return "[AppXOptions](appx.md)"
    }
    if (types.some(it => it.endsWith("SquirrelWindowsOptions"))) {
      return "[SquirrelWindowsOptions](squirrel-windows.md)"
    }

    if (types.some(it => it.endsWith("MacConfiguration"))) {
      return "[MacConfiguration](mac.md)"
    }
    if (types.some(it => it.endsWith("DmgOptions"))) {
      return "[DmgOptions](dmg.md)"
    }
    if (types.some(it => it.endsWith("MasConfiguration"))) {
      return "[MasConfiguration](mas.md)"
    }
    if (types.some(it => it.endsWith("PkgOptions"))) {
      return "[PkgOptions](pkg.md)"
    }

    if (types.some(it => it.endsWith("LinuxConfiguration"))) {
      return "[LinuxConfiguration](linux.md)"
    }
    if (types.some(it => it.endsWith("SnapOptions"))) {
      return "[SnapOptions](snap.md)"
    }
    if (types.some(it => it.endsWith("AppImageOptions"))) {
      return "[AppImageOptions](/configuration/linux-other.md#appimageoptions)"
    }
    if (types.some(it => it.endsWith("DebOptions"))) {
      return "[DebOptions](deb.md)"
    }
    if (types.some(it => it.endsWith("LinuxTargetSpecificOptions"))) {
      return "[LinuxTargetSpecificOptions](/configuration/linux-other.md)"
    }

    return originalRenderTypeName.call(this, context)
  }

  const pages = [
    new Page("configuration/configuration.md", "Configuration", {
      "Metadata": "Some standard fields should be defined in the `package.json`."
    }),

    new Page("configuration/mac.md", "MacConfiguration"),
    new Page("configuration/dmg.md", "DmgOptions"),
    new Page("configuration/mas.md", "MasConfiguration"),
    new Page("configuration/pkg.md", "PkgOptions"),

    new Page("configuration/win.md", "WindowsConfiguration"),
    new Page("configuration/nsis.md", "NsisOptions"),
    new Page("configuration/appx.md", "AppXOptions"),
    new Page("configuration/squirrel-windows.md", "SquirrelWindowsOptions"),

    new Page("configuration/linux.md", "LinuxConfiguration"),
    new Page("configuration/deb.md", "DebOptions"),
    new Page("configuration/snap.md", "SnapOptions"),
    new Page("configuration/linux-other.md", null, {
      "AppImageOptions": "The top-level `appImage` key contains set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/).",
      "LinuxTargetSpecificOptions": "The top-level `apk`, `freebsd`, `pacman`, `p5p`,`rpm` keys contains set of options instructing electron-builder on how it should build corresponding Linux target.",
    }),

    new Page("configuration/publish.md", null, {
      "BintrayOptions": "",
      "GenericServerOptions": "",
      "GithubOptions": "",
      "S3Options": "",
    }),

    // new Page("auto-update.md", null, {
    //   "AppUpdater": "",
    //   "UpdateInfo": "",
    // }),

    new Page("configuration/target.md", "TargetConfiguration"),
  ]

  renderer.dataMap = dataMap

  for (const item of data) {
    for (const page of pages) {
      if (page.rootClass === item.name || (page.additionalClasses != null && Object.keys(page.additionalClasses).includes(item.name))) {
        page.items.set(item.name, item)
        break
      }
    }
  }

  for (const page of pages) {
    let content = ""
    // one root class per page
    if (page.rootClass != null) {
      const item = page.items.get(page.rootClass)
      if (item == null) {
        throw new Error(`No item ${page.rootClass}`)
      }

      content = renderer.renderProperties(item)
    }

    if (page.additionalClasses != null) {
      if (page.rootClass != null) {
        content += "\n"
      }
      for (const name of Object.keys(page.additionalClasses)) {
        const item = page.items.get(name)
        if (content.length > 0) {
          content += "\n"
        }
        content += `## ${item.name}\n`
        content += `${page.additionalClasses[name] || item.description}\n\n`
        content += renderer.renderProperties(item)
        content += "\n"
      }
    }

    await writeDocFile(path.join(__dirname, "..", "docs", page.file), content)
  }
}

const inlinedClasses = new Set(["AsarOptions", "ElectronDownloadOptions", "NsisWebOptions", "PortableOptions"])

function isInlinedMember(member) {
  if (member.id.includes(".Dmg") && member.name !== "DmgOptions") {
    return true
  }
  return inlinedClasses.has(member.name) || member.name === "Protocol" || member.name === "FileAssociation" || member.name === "AuthorMetadata" || member.name === "RepositoryInfo" || member.name === "ReleaseInfo"
}

function sortOptions(pages) {
  const electronBuilderApiPage = pages[0]

  const excluded = new Set(["CommonLinuxOptions", "CommonNsisOptions", "LinuxTargetSpecificOptions", "PlatformSpecificBuildOptions", "ForgeOptions", "FileSet"])
  electronBuilderApiPage.data = electronBuilderApiPage.data.filter(member => {
    if (member.kind === "module" || excluded.has(member.name)) {
      return true
    }
    return !(isInlinedMember(member) || member.name.endsWith("Options") || member.name.endsWith("Configuration") || member.name === "Configuration" || member.name.startsWith("Metadata") || member.name.startsWith("Dmg"))
  })

  // move Arch from builder-util to electron-builder
  electronBuilderApiPage.data = electronBuilderApiPage.data.filter(member => {
    if (!member.id.startsWith("module:builder-util")) {
      return true
    }

    if (member.name === "Arch") {
      member.id = "module:electron-builder.Arch"
      member.longname = member.id
      member.memberof = "module:electron-builder"
      return true
    }

    pages[0].dataMap.delete(member.id)
    return false
  })

  // pages[0].data = pages[0].data.filter(member => {
  //   const isInlined = member.name.endsWith("MetadataDirectories") || member.id.includes(".Dmg") || isOptionMember(member)
  //   if (isInlined) {
  //     member.inlined = true
  //   }
  //   return !isInlined
  // })

  // pages[1].data.unshift(pages[0].data[0])
}

function sortAutoUpdate(pages) {
  const pageIndex = 1

  const filtered = []
  const included = new Set(["AppUpdater", "UpdaterSignal", "UpdateInfo", "VersionInfo", "UpdateCheckResult", "FileInfo", "Logger"])
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

    filtered.push(member)
    return false
  })

  pages[pageIndex].data = pages[pageIndex].data.filter(member => {
    if (!member.id.startsWith("module:electron-builder-http")) {
      return true
    }

    if (member.name === "UpdateInfo" || member.name === "VersionInfo") {
      member.id = "module:electron-updater." + member.name
      member.longname = member.id
      member.memberof = "module:electron-updater"
      // move to end
      member.order += pages[pageIndex].data.length + 1 // order started from 1
      return true
    }

    pages[pageIndex].dataMap.delete(member.id)

    return false
  })

  pages[pageIndex].data.sort((a, b) => a.order - b.order)
}

async function render(pages, jsdoc2MdOptions) {
  require(path.join(__dirname, "jsdoc", "helpers.js")).pages = pages

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
    const finalOptions = Object.assign({
      data: page.data,
      "property-list-format": page === pages[0] || page === pages[3] || page === pages[1] ? "list" : "table",
      "param-list-format": page === pages[1] ? "list" : "table",
    }, jsdoc2MdOptions)

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