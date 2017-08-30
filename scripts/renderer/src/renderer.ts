export let dataMap: any

export class Page {
  readonly items = new Map<string, Item>()

  constructor(readonly file: string, readonly rootClass: string | null, readonly additionalClasses: any) {
  }
}

interface Item {
  inherits: any
  inherited: boolean
  isExported: boolean
  id: string
  name: string
  description?: string

  type: ItemType

  properties: Array<Item>

  augments?: Array<string>

  kind: string

  inlined?: boolean
  rendered?: boolean
}

interface ItemType {
  names: Array<string>
}

export function resolveById(id: string): Item | null {
  // for (const page of exports.pages) {
  const member = dataMap.get(id)
  if (member != null) {
    return member
  }
  // }
  return null
}

export let customTypeNamePrinter: (types: Array<string>) => string | null

function renderClassName(item: Item) {
  if (customTypeNamePrinter != null) {
    const custom = customTypeNamePrinter([item.name])
    if (custom != null) {
      return custom
    }
  }
  return `[${item.name}](#${getAnchorName(item)})`
}

export function renderProperties(object: Item, level = 0) {
  let result = ""

  let firstDocumentedParent = null
  const parents = object.augments
  if (parents != null) {
    for (const parentId of parents) {
      if (!parentId.endsWith("TargetSpecificOptions") && !parentId.endsWith("CommonLinuxOptions") && !parentId.endsWith("CommonNsisOptions") && !parentId.endsWith("PublishConfiguration") && !parentId.endsWith("VersionInfo")) {
        if (firstDocumentedParent == null && !parentId.endsWith("PlatformSpecificBuildOptions")) {
          firstDocumentedParent = resolveById(parentId)
        }
      }
    }
  }

  let indent = ""
  for (let d = 0; d < level; d++) {
    indent += "  "
  }

  // for level 0 "Extends" is printed
  if (level > 0 && firstDocumentedParent != null) {
    result += `${indent}Inherits ${renderClassName(firstDocumentedParent)} options.\n`
  }

  const doRenderProperties = (properties: Array<Item>) => {
    const first = properties[0]
    for (const member of properties) {
      if (member !== first) {
        result += "\n"
      }

      result += indent + "* " + renderMemberName(member, object)

      const types = member.type.names
      let child = getInlinedChild(types)
      const propertyTypeItem = child
      if (child != null && (!child.inlined || child.rendered)) {
        child = null
      }

      if (child == null || types.some(it => it.startsWith("Array.<") || isPrimitiveType(it))) {
        let custom = null
        if (customTypeNamePrinter != null) {
          custom = customTypeNamePrinter(types)
        }

        if (custom !== "") {
          result += " "
          if (custom == null) {
            result += renderTypeNames(types, " \| ", false, true, child == null ? null : child.id)
          }
          else {
            result += custom
          }
        }
      }

      if (child != null) {
        result += `<a name="${child.name}"></a>`
      }

      let description = member.description
      if (propertyTypeItem != null && !description) {
        description = propertyTypeItem.description
      }

      if (description) {
        result += " - " + renderMemberListDescription(description, indent + "  ")
      }

      if (child != null) {
        child.rendered = true
        result += "\n"
        result += renderProperties(child, level + 1)
      }
    }
  }

  doRenderProperties(object.properties)

  // no need to show MacConfiguration options for MasConfiguration
  if (parents != null && level === 0 && object.name !== "MasConfiguration") {
    for (const parentId of parents) {
      const parent = resolveById(parentId)
      if (parent == null) {
        console.log(`Unresolved parent \`${parentId}\``)
        continue
      }

      if (parent.name === "PlatformSpecificBuildOptions") {
        // no need to include big PlatformSpecificBuildOptions to mac/win/linux docs.
        continue
      }

      let renderedParentTypeName = "`" + parent.name + "`"
      if (customTypeNamePrinter != null) {
        // no need to point user to API docs, but if there is customTypeNamePrinter, maybe link to some docs will be provided
        const custom = customTypeNamePrinter([parent.name])
        if (custom != null) {
          renderedParentTypeName = custom
        }
      }

      result += "\n"
      // looks strange when on LinuxConfiguration page "Inherited from `CommonLinuxOptions`:" - no configuration inheritance in this case.
      if (object.name !== "LinuxConfiguration" && (object.name !== "NsisOptions" || parent.name !== "CommonNsisOptions")) {
        result += `\nInherited from ${renderedParentTypeName}:\n`
      }

      doRenderProperties(parent.properties.filter(parentProperty => !object.properties.some(it => it.name === parentProperty.name)))
    }
  }

  if (level === 0) {
    // result += "\n\n"
    // a little bit hack - add Methods header if methods next, otherwise TOC will be part of properties list
    // for (const member of root) {
    //   if (member.kind === "function" && member.memberof === object.id) {
    //     result += "**Methods**"
    //     break
    //   }
    // }
  }
  return result
}

function getInlinedChild(types: Array<string>) {
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

function isPrimitiveType(name: string) {
  return name === "string" || name === "boolean"
}

/**
 * inlinedTypeId - no need to print as link if object will be renderer as part of the property docs.
 */
function renderTypeNames(types: Array<string>, delimiter: string, isTypeAsCode: boolean, isSkipNull: boolean, inlinedTypeId: string | null) {
  if (types == null) {
    return ""
  }

  for (const obj of types) {
    if (obj.includes("CancellationToken")) {
      break
    }
  }

  if (isSkipNull) {
    types = types.filter(it => it !== "null")
  }

  const tagOpen = isTypeAsCode ? "<code>" : ""
  const tagClose = isTypeAsCode ? "</code>" : ""
  return types
    .map(it => tagOpen + renderLink(catharsis.parse(it, {jsdoc: true}), delimiter, isSkipNull, inlinedTypeId) + tagClose)
    .join(delimiter)
}

const catharsis = require("catharsis")

function renderLink(type: any, delimiter: string, isSkipNull: boolean, inlinedTypeId: string | null): string {
  switch (type.type) {
    case "NameExpression":
      if (type.name === inlinedTypeId) {
        return resolveById(inlinedTypeId!!)!!.name
      }
      return identifierToLink(type.name)

    case "NullLiteral":
    case "UndefinedLiteral":
      return type.typeExpression

    case "FunctionType":
      return type.typeExpression

    case "TypeUnion":
      return (type.elements as Array<any>)
        .map(it => renderLink(it, delimiter, isSkipNull, inlinedTypeId))
        .filter(it => !isSkipNull || it !== "null")
        .join(delimiter)

    case "TypeApplication":
      return renderLink(type.expression, delimiter, isSkipNull, inlinedTypeId) + "&lt;" + type.applications.map((it: any) => renderLink(it, delimiter, isSkipNull, inlinedTypeId)).join(", ") + "&gt;"

    default:
      throw new Error(`Unsupported type ${type.type}`)
  }
}

function identifierToLink(id: any) {
  if (id === "string") {
    return "String"
  }
  if (id === "boolean") {
    return "Boolean"
  }
  if (id === "number") {
    return "Number"
  }

  let linked = resolveById(id)
  if (linked == null) {
    if (id === "module:electron-builder/out/core.Arch" || id === "module:builder-util/out/arch.Arch") {
      id = "module:builder-util.Arch"
    }
    else if (id === "module:electron-builder-http/out/CancellationToken.CancellationToken") {
      id = "module:electron-builder-http.CancellationToken"
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
      console.warn(`Unresolved member ${id}`)
    }
    return id
  }
  return `[${linked.name}](${fullLink(linked)})`
}

function fullLink(linked: any) {
  const relativeName = getAnchorName(linked)
  const pageUrl = ""
  // for (const page of exports.pages) {
  //   if (page.dataMap.has(linked.id)) {
  //     const a = page.data
  //     const b = root
  //     if (a.length !== b.length || a[a.length - 1] !== b[a.length - 1]) {
  //       pageUrl = page.pageUrl
  //     }
  //     break
  //   }
  // }
  return `${pageUrl}#${relativeName}`
}

export function renderMemberName(member: any, object: any) {
  const wrap = member.optional ? "" : "**"
  // gitbook doesn't like several "a" tags in a row (another one will be added if property is an object and documented as inlined)
  // in any case better to avoid empty "a" tags, since ` will be transformed to <code>
  let result = `${wrap}<code id="${object.name}-${member.name}">${member.name}</code>${wrap}`
  if (member.defaultvalue != null) {
    // noinspection SpellCheckingInspection
    result += ` = \`${member.defaultvalue}\``
  }
  return result
}

const dmdHelper = require("dmd/helpers/helpers")

function renderMemberListDescription(text: string, indent: string) {
  return dmdHelper.inlineLinks(text)
    .replace(/<br>/g, "\n")
    .replace(/\n/g, "\n" + indent)
    .replace(new RegExp("\\*{2}\\\\/", "g"), "**/")
}

function getAnchorName(item: Item): string {
  if (item.id == null) {
    throw new Error(`Cannot create a link without a id: ${JSON.stringify(item)}`)
  }

  if (item.inherited) {
    const inherits = resolveById(item.inherits)
    return inherits ? getAnchorName(inherits) : ""
  }

  if (item.kind === "class" || item.kind === "interface" || item.kind === "enum") {
    return item.name
  }

  let result = item.isExported ? "exp_" : ""
  if (item.kind === "constructor") {
    result += "new_"
  }
  result +=
    item.id
      .replace(/:/g, "_")
      .replace(/~/g, "..")
      .replace(/\(\)/g, "_new")
      .replace(/#/g, "+")
  return result
}