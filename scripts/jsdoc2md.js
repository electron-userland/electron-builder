"use strict"

require("source-map-support").install()

const globby = require("globby")
const path = require("path")
const fs = require("fs-extra")
const jsdoc2md = require("jsdoc-to-markdown")
const pathSorter = require("path-sort")
const source = path.join(__dirname, "jsdoc", "out")

async function main() {
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

    // {
    //   page: "auto-update.md", pageUrl: "auto-update", mainHeader: "API",
    //   files: [
    //     path.join(source, "updater/electron-updater.js"),
    //     path.join(source, "builder-util-runtime/builder-util-runtime.js"),
    //   ]
    // },
  ]

  const jsdoc2MdOptions = {
    partial: partials,
    "name-format": true,
    "helper": [
      path.join(partialDir, "helpers.js")
    ],
  }
  await render2([
    path.join(source, "builder", "electron-builder.js"),
    path.join(source, "builder-lib", "app-builder-lib.js"),
    path.join(source, "builder-util-runtime", "builder-util-runtime.js")
  ], jsdoc2MdOptions)

  await render(pages, jsdoc2MdOptions)
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
    "fileAssociations", "directories", "buildVersion", "mac", "linux", "win", "buildDependenciesFromSource", "afterPack", "remoteBuild",
    "installerIcon", "include", "createDesktopShortcut", "displayLanguageSelector", "signingHashAlgorithms", "publisherName",
    "forceCodeSigning",
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

      if (context.typeItem.name === "BaseS3Options") {
        return ""
      }

      if (context.typeItem.name === "LinuxTargetSpecificOptions" && context.object.name === "DebOptions") {
        return null
      }
      if (context.typeItem.name === "TargetSpecificOptions" && context.object.name === "NsisOptions") {
        return null
      }

      // looks strange when on LinuxConfiguration page "Inherited from `CommonLinuxOptions`:" - no configuration inheritance in this case
      if (context.object.name === "LinuxConfiguration" || (context.object.name === "NsisOptions" && (context.typeItem.name === "CommonNsisOptions" || context.typeItem.name === "CommonWindowsInstallerConfiguration"))) {
        return ""
      }
    }

    let types = context.types
    if (types == null) {
      types = [context.typeItem.id]
    }

    if (context.property != null && context.property.name === "publish") {
      return "The [publish](/configuration/publish) options."
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
        return `The [${label}](/configuration/contents#${propertyName.toLowerCase()}) configuration.`
      }

      if (context.property.name === "sign" && context.object.name === "WindowsConfiguration") {
        return "String | (configuration: CustomWindowsSignTaskConfiguration) => Promise"
      }
      else if (context.property.name === "plugs" && context.object.name === "SnapOptions") {
        return "Array&lt;String | SnapOptions.PlugDescriptor&gt;"
      }
      else if (context.object.name === "Configuration") {
        if (context.property.name === "afterPack" || context.property.name === "afterSign" || context.property.name === "afterAllArtifactBuild" || context.property.name === "onNodeModuleFile") {
          return ""
        }
        if (context.property.name === "beforeBuild") {
          return "(context: BeforeBuildContext) => Promise | null"
        }
      }
    }

    if (types.some(it => it.endsWith("TargetConfiguration"))) {
      return "String | [TargetConfiguration](/cli#targetconfiguration)"
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
      return "[WindowsConfiguration](win)"
    }
    if (types.some(it => it.endsWith(".NsisOptions") || it === "NsisOptions")) {
      return "[NsisOptions](nsis)"
    }
    if (types.some(it => it.endsWith("AppXOptions"))) {
      return "[AppXOptions](appx)"
    }
    if (types.some(it => it.endsWith("SquirrelWindowsOptions"))) {
      return "[SquirrelWindowsOptions](squirrel-windows.md)"
    }

    if (types.some(it => it.endsWith("MacConfiguration"))) {
      return "[MacConfiguration](mac)"
    }
    if (types.some(it => it.endsWith("DmgOptions"))) {
      return "[DmgOptions](dmg)"
    }
    if (types.some(it => it.endsWith("MasConfiguration"))) {
      return "[MasConfiguration](mas)"
    }
    if (types.some(it => it.endsWith("PkgOptions"))) {
      return "[PkgOptions](pkg)"
    }

    if (types.some(it => it.endsWith("LinuxConfiguration"))) {
      return "[LinuxConfiguration](linux)"
    }
    if (types.some(it => it.endsWith("SnapOptions"))) {
      return "[SnapOptions](snap)"
    }
    if (types.some(it => it.endsWith("AppImageOptions"))) {
      return "[AppImageOptions](/configuration/linux#appimageoptions)"
    }
    if (types.some(it => it.endsWith("DebOptions"))) {
      return "[DebOptions](/configuration/linux#de)"
    }
    if (types.some(it => it.endsWith("LinuxTargetSpecificOptions"))) {
      return "[LinuxTargetSpecificOptions](/configuration/linux#LinuxTargetSpecificOptions)"
    }

    return originalRenderTypeName.call(this, context)
  }

  const pages = [
    new Page("configuration/configuration.md", "Configuration"),

    new Page("configuration/mac.md", "MacConfiguration"),
    new Page("configuration/dmg.md", "DmgOptions"),
    new Page("configuration/mas.md", "MasConfiguration"),
    new Page("configuration/pkg.md", "PkgOptions"),

    new Page("configuration/win.md", "WindowsConfiguration"),
    new Page("configuration/appx.md", "AppXOptions"),
    new Page("configuration/squirrel-windows.md", "SquirrelWindowsOptions"),

    new Page("configuration/linux.md", "LinuxConfiguration"),
    new Page("configuration/snap.md", "SnapOptions"),

    new Page("configuration/publish.md", null, {
      "BintrayOptions": "",
      "GenericServerOptions": "",
      "GithubOptions": "",
    }),

    new Page("generated/s3-options.md", "S3Options"),
    new Page("generated/snap-store-options.md", null, {"SnapStoreOptions": ""}),
    new Page("generated/spaces-options.md", null, {"SpacesOptions": ""}),

    new Page("generated/appimage-options.md", "AppImageOptions"),
    new Page("generated/DebOptions.md", "DebOptions"),
    new Page("generated/LinuxTargetSpecificOptions.md", "LinuxTargetSpecificOptions"),
    new Page("generated/PlatformSpecificBuildOptions.md", "PlatformSpecificBuildOptions"),
    new Page("generated/Metadata.md", "Metadata"),
    new Page("generated/NsisOptions.md", "NsisOptions"),
    new Page("generated/TargetSpecificOptions.md", "TargetSpecificOptions"),
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

    await writeDocFile(path.join(__dirname, "..", "docs", page.file), content + "\n" /* mkdocs requires extra newline otherwise trailing link is not rendered */)
  }
}

const inlinedClasses = new Set(["AsarOptions", "ElectronDownloadOptions", "NsisWebOptions", "PortableOptions", "DmgContent"])

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
    if (member.kind === "module") {
      return true
    }
    if (excluded.has(member.name)) {
      return false
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
  const included = new Set(["AppUpdater", "UpdaterSignal", "UpdateInfo", "UpdateCheckResult", "FileInfo", "Logger"])
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
    if (!member.id.startsWith("module:builder-util-runtime")) {
      return true
    }

    if (member.name === "UpdateInfo") {
      member.id = "module:electron-updater." + member.name
      member.longname = member.id
      member.memberof = "module:electron-updater"
      // move to end
      member.order += pages[pageIndex].data.length + 22 // order started from 1
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
  // sortAutoUpdate(pages)

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
      return fs.outputFile(docOutFile, existingContent.substring(0, start + startMarker.length) + "\n" + content + "\n" + existingContent.substring(end).trim() + "\n")
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
