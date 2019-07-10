"use strict"

const dmdHelpers = require("dmd/helpers/ddata")
const dmdHelper = require("dmd/helpers/helpers")
const catharsis = require("catharsis")

exports.propertyAnchor = function (propertyName, parentName) {
  return `<a name="${parentName}-${propertyName}"></a>`
}

exports.exampleAnchor = function (caption, parentName) {
  return `<a name="${parentName}-${caption.toLowerCase().replace(/ /g, "-")}"></a>`
}

function renderTypeNames(types, delimiter, root, isTypeAsCode, isSkipNull) {
  if (types == null) {
    return ""
  }

  const tagOpen = isTypeAsCode ? "<code>" : ""
  const tagClose = isTypeAsCode ? "</code>" : ""

  for (let obj of types) {
    if (obj.includes("CancellationToken")) {
      break
    }
  }

  if (isSkipNull) {
    types = types.filter(it => !isSkipNull || it !== "null")
  }
  return types
    .map(it => tagOpen + link2(catharsis.parse(it, {jsdoc: true}), delimiter, root, isSkipNull) + tagClose)
    .join(delimiter)
}

exports.listTypes = renderTypeNames
exports.renderProperties = function (properties, root) {
  return renderProperties(properties, root, 0)
}

function renderMemberListDescription(text, indent) {
  return dmdHelper.inlineLinks(text)
    .replace(/<br>/g, "\n")
    .replace(/\n/g, "\n" + indent)
    .replace(new RegExp("\\*{2}\\\\/", "g"), "**/")
}

function getInlinedChild(types) {
  if (types == null) {
    return null
  }

  const arrayTypePrefix = "Array.<"
  types = types.filter(it => {
    if (it === "null" || isPrimitiveType(it)) {
      return false
    }
    if (it.startsWith(arrayTypePrefix)) {
      it = it.replace("string|", "").replace("<(", "<").replace(")>", ">")
      return !types.includes(it.substring(arrayTypePrefix.length, it.indexOf(">")))
    }
    return true
  })
  return types.length === 1 ? resolveById(types[0]) : null
}

function isPrimitiveType(name) {
  return name === "string" || name === "boolean"
}

function renderProperties(object, root, level) {
  let result = ""

  let properties = object.properties

  let firstDocumentedParent = null
  const parents = object.augments
  if (parents != null) {
    for (const parentId of parents) {
      if (!parentId.endsWith("TargetSpecificOptions") && !parentId.endsWith("CommonLinuxOptions") && !parentId.endsWith("CommonNsisOptions") && !parentId.endsWith("PublishConfiguration")) {
        if (firstDocumentedParent == null && !parentId.endsWith("PlatformSpecificBuildOptions")) {
          firstDocumentedParent = resolveById(parentId)
        }
        continue
      }

      const parent = resolveById(parentId)
      if (parent != null) {
        properties = properties.concat(parent.properties.filter(parentProperty => !properties.some(it => it.name === parentProperty.name)))
      }
    }
  }

  let indent = ""
  for (let d = 0; d < level; d++) {
    indent += "  "
  }

  // for level 0 "Extends" is printed
  if (firstDocumentedParent != null && level > 0) {
    result += `${indent}Inherits [${firstDocumentedParent.name}](#${anchorName.call(firstDocumentedParent)}) options.\n`
  }

  const first = properties[0]
  for (const member of properties) {
    if (member !== first) {
      result += "\n"
    }

    result += indent + "* " + renderMemberName(member, object)

    const types = member.type == null ? [] : member.type.names
    let child = getInlinedChild(types)
    if (child != null && (!child.inlined || child.rendered)) {
      child = null
    }

    if (child == null || types.some(it => it.startsWith("Array.<") || isPrimitiveType(it))) {
      result += " " + renderTypeNames(types, " \| ", root, false, true)
    }

    if (child != null) {
      result += `<a name="${child.name}"></a>`
    }

    let description = member.description
    if (child != null && !description) {
      description = child.description
    }

    if (description) {
      result += " - " + renderMemberListDescription(description, indent + "  ")
    }

    if (child != null) {
      child.rendered = true
      result += "\n"
      result += renderProperties(child, root, level + 1)
    }
  }

  if (level === 0) {
    result += "\n\n"
    // a little bit hack - add Methods header if methods next, otherwise TOC will be part of properties list
    for (const member of root) {
      if (member.kind === "function" && member.memberof === object.id) {
        result += "**Methods**"
        break
      }
    }
  }
  return result
}

function renderMemberName(member, object) {
  const wrap = member.optional ? "" : "**"
  // gitbook doesn't like several "a" tags in a row (another one will be added if property is an object and documented as inlined)
  // in any case better to avoid empty "a" tags, since ` will be transformed to <code>
  let result = `${wrap}<code id="${object.name}-${member.name}">${member.name}</code>${wrap}`
  if (member.defaultvalue != null) {
    result += " = `" + member.defaultvalue + "`"
  }
  return result
}

function link(longname, options) {
  //noinspection JSUnresolvedFunction
  return options.fn(_link(longname, options))
}

exports.link = link
exports.anchorName = anchorName

function _link(input, options) {
  if (typeof input !== 'string') {
    return null
  }

  /*
   test input for
   1. A type expression containing a namepath, e.g. Array.<module:Something>
   2. a namepath referencing an `id`
   3. a namepath referencing a `longname`
   */
  const matches = input.match(/.*?<\(?(.*?)\(?>/)
  const namepath = matches ? matches[1].split("|").map(it => it.trim()) : input

  let linked = resolveById(namepath)
  if (!linked) {
    options.hash = {longname: namepath}
    linked = _identifier(options)
  }

  if (!linked) {
    return {name: input, url: null}
  }

  const output = {
    name: input.replace(namepath, linked.name),
  }

  if (isExternal.call(linked)) {
    if (linked.description) {
      output.url = `#${anchorName.call(linked, options)}`
    }
    else {
      if (linked.see && linked.see.length) {
        const firstLink = parseLink(linked.see[0])[0]
        output.url = firstLink ? firstLink.url : linked.see[0]
      }
      else {
        output.url = null
      }
    }
  }
  else {
    output.url = fullLink(linked, options.data.root)
  }
  return output
}


function link2(type, delimiter, root, isSkipNull) {
  switch (type.type) {
    case "NameExpression":
      return identifierToLink(type.name, root)

    case "NullLiteral":
    case "UndefinedLiteral":
      return type.typeExpression

    case "FunctionType":
      return type.typeExpression

    case "TypeUnion":
      return type.elements
        .map(it => link2(it, delimiter, root))
        .filter(it => !isSkipNull || it !== "null")
        .join(delimiter)

    case "TypeApplication":
      return link2(type.expression, delimiter, root) + "&lt;" + type.applications.map(it => link2(it, delimiter, root)).join(", ") + "&gt;"

    default:
      throw new Error(`Unsupported type ${type.type}`)
  }
}

function identifierToLink(id, root) {
  if (id === "string") {
    return "String"
  }
  if (id === "boolean") {
    return "Boolean"
  }
  if (id === "number") {
    return "Number"
  }
  if (id === "internal:EventEmitter") {
    return "[EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)"
  }
  if (id.endsWith(".OutgoingHttpHeaders")) {
    // no need to point to external docs in this case
    return "[key: string]: string"
  }

  let linked = resolveById(id)
  if (linked == null) {
    if (id === "module:electron-builder/out/core.Arch" || id === "module:builder-util/out/arch.Arch" || id === "Arch") {
      id = "module:builder-util.Arch"
    }
    else if (id === "module:builder-util-runtime/out/CancellationToken.CancellationToken") {
      id = "module:builder-util-runtime.CancellationToken"
    }
    linked = resolveById(id)
  }

  if (linked == null) {
    if (id.startsWith("module") &&
      !id.startsWith("module:http.") &&
      !id.startsWith("module:bluebird-lst.") &&
      !id.startsWith("module:child_process.") &&
      !id.endsWith(".T") &&
      !id.endsWith(".R") &&
      !id.endsWith(".K") &&
      !id.endsWith(".DC") &&
      !id.startsWith("module:fs.") &&
      id !== "module:https.RequestOptions" &&
      !id.endsWith(".__type")
    ) {
      for (const name of ["GithubOptions", "GenericServerOptions", "BintrayOptions", "S3Options", "SpacesOptions", "PublishConfiguration", "SnapStoreOptions"]) {
        if (id.endsWith(`.${name}`)) {
          return `[${name}](/configuration/publish#${name.toLowerCase()})`
        }
      }

      const p = "module:builder-util-runtime/out/updateInfo."
      if (id.startsWith(p)) {
        // don't want complicate docs, if someone need - just see source code
        return "module:builder-util-runtime." + id.substring(p.length)
      }

      if (id.endsWith(".PlatformPackager")) {
        // don't want complicate docs, if someone need - just see source code
        return "PlatformPackager"
      }
      if (id.endsWith(".Dependency")) {
        // don't want complicate docs, if someone need - just see source code
        return "Dependency"
      }
      if (id.endsWith(".RequestHeaders")) {
        // don't want complicate docs, if someone need - just see source code
        return "[key: string]: string"
      }

      console.warn(`Unresolved member (helpers.js) ${id}`)
    }
    return id
  }

  if (isExternal.call(linked)) {
    if (linked.description) {
      output.url = `#${anchorName.call(linked, options)}`
    }
    else {
      if (linked.see && linked.see.length) {
        const firstLink = parseLink(linked.see[0])[0]
        output.url = firstLink ? firstLink.url : linked.see[0]
      }
      else {
        output.url = null
      }
    }
    return output
  }
  return `[${linked.name}](${fullLink(linked, root)})`
}

function fullLink(linked, root) {
  const relativeName = anchorName.call(linked)
  let pageUrl = ""
  for (const page of exports.pages) {
    if (page.dataMap.has(linked.id)) {
      const a = page.data
      const b = root
      if (a.length !== b.length || a[a.length - 1] !== b[a.length - 1]) {
        pageUrl = page.pageUrl
      }
      break
    }
  }
  return `${pageUrl}#${relativeName}`
}

function resolveById(id) {
  for (const page of exports.pages) {
    const member = page.dataMap.get(id)
    if (member != null) {
      return member
    }
  }
  return null
}

function isExternal() {
  return this.kind === "external"
}

function anchorName() {
  if (!this.id) {
    throw new Error(`[anchorName helper] cannot create a link without a id: ${JSON.stringify(this)}`)
  }

  if (this.inherited) {
    const inherits = resolveById(this.inherits)
    return inherits ? anchorName.call(inherits) : ""
  }

  if (this.kind === "class" || this.kind === "interface" || this.kind === "enum") {
    return this.name
  }

  let result = this.isExported ? "exp_" : ""
  if (this.kind === "constructor") {
    result += "new_"
  }
  result +=
    this.id
      .replace(/:/g, "_")
      .replace(/~/g, "..")
      .replace(/\(\)/g, "_new")
      .replace(/#/g, "+")
  return result
}

function _identifier(options) {
  return _identifiers(options)[0]
}

function _identifiers (options) {
  return dmdHelpers._identifiers(options)
}

function parseLink(text) {
  return dmdHelpers.parseLink(text)
}