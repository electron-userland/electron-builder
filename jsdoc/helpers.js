"use strict"

const dmdHelpers = require("dmd/helpers/ddata")
const catharsis = require("catharsis")

exports.propertyAnchor = function (propertyName, parentName) {
  return `<a name="${parentName}-${propertyName}"></a>`
}

exports.listTypes = function (types, delimiter, root) {
  return types == null ? "" : types.map(it => "<code>" + link2(catharsis.parse(it, {jsdoc: true}), delimiter, root) + "</code>").join(delimiter)
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
    let isOnCurrentPage = false
    const firstMember = options.data.root[0]
    function isOurPage(otherRoot) {
      return firstMember.id === otherRoot[0].id
    }
    
    for (const page of exports.pages) {
      if (isOurPage(page.data)) {
        isOnCurrentPage = page.dataMap.has(linked.id)
        break
      }
    }
    
    let pageUrl = ""
    if (!isOnCurrentPage) {
      for (const page of exports.pages) {
        if (!isOurPage(page.data) && page.dataMap.has(linked.id)) {
          pageUrl = page.pageUrl
        }
      }
    }
    output.url = `${pageUrl}#${anchorName.call(linked, options)}`
  }
  return output
}


function link2(type, delimiter, root) {
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
        .join(delimiter)
    
    case "TypeApplication":
      return link2(type.expression, delimiter, root) + "&lt;" + type.applications.map(it => link2(it, delimiter, root)).join(", ") + "&gt;"

    default:
      throw new Error(`Unsupported type ${type.type}`)
  }
}

function identifierToLink(id, root) {
  let linked = resolveById(id)
  if (!linked) {
    if (id.startsWith("module")) {
      console.warn(`Unresolved member ${id}`)
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
  
  let isOnCurrentPage = false
  const firstMember = root[0]

  function isOurPage(otherRoot) {
    return firstMember.id === otherRoot[0].id
  }

  for (const page of exports.pages) {
    if (isOurPage(page.data)) {
      isOnCurrentPage = page.dataMap.has(linked.id)
      break
    }
  }

  let pageUrl = ""
  if (!isOnCurrentPage) {
    for (const page of exports.pages) {
      if (!isOurPage(page.data) && page.dataMap.has(linked.id)) {
        pageUrl = page.pageUrl
      }
    }
  }
  return `[${linked.name}](${pageUrl}#${anchorName.call(linked)})`
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