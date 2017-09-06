import { renderProperties } from "./properties"

export enum TypeNamePlace {
  PROPERTY, INHERITED_FROM, INHERITS
}

export class Renderer {
  constructor(readonly dataMap: Map<string, Item>) {
  }

  isInsertHorizontalLineBefore(property: Item): boolean {
    return false
  }

  isRenderParentPropertiesBefore(object: Item): boolean {
    return false
  }

  // INHERITED_FROM - null result means skip, empty string result means to not print "Inherited from "
  renderTypeName: ((context: RenderContext) => string | null) = context => {
    if (context.place === TypeNamePlace.INHERITED_FROM) {
      return "`" + context.typeItem!!.name + "`"
    }
    else if (context.place === TypeNamePlace.INHERITS) {
      return `[${context.typeItem!!.name}](#${getAnchorName(this, context.typeItem!!)})`
    }
    return this.renderTypeNames(context.types!!, " \| ", false, true, context.typeItem == null ? null : context.typeItem.id)
  }

  renderProperties(object: Item, level = 0) {
    return renderProperties(this, object, level)
  }

  resolveById(id: string) {
    return this.dataMap.get(id)
  }

  /**
   * inlinedTypeId - no need to print as link if object will be renderer as part of the property docs.
   */
  renderTypeNames(types: Array<string>, delimiter: string, isTypeAsCode: boolean, isSkipNull: boolean, inlinedTypeId: string | null) {
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
      .map(it => tagOpen + this.renderLink(catharsis.parse(it, {jsdoc: true}), delimiter, isSkipNull, inlinedTypeId) + tagClose)
      .join(delimiter)
  }

  renderLink(type: any, delimiter: string, isSkipNull: boolean, inlinedTypeId: string | null): string {
    switch (type.type) {
      case "NameExpression":
        if (type.name === inlinedTypeId) {
          return this.resolveById(inlinedTypeId!!)!!.name
        }
        return identifierToLink(this, type.name)

      case "NullLiteral":
      case "UndefinedLiteral":
        return type.typeExpression

      case "FunctionType":
        return type.typeExpression

      case "TypeUnion":
        return (type.elements as Array<any>)
          .map(it => this.renderLink(it, delimiter, isSkipNull, inlinedTypeId))
          .filter(it => !isSkipNull || it !== "null")
          .join(delimiter)

      case "TypeApplication":
        return this.renderLink(type.expression, delimiter, isSkipNull, inlinedTypeId) + "&lt;" + type.applications.map((it: any) => this.renderLink(it, delimiter, isSkipNull, inlinedTypeId)).join(", ") + "&gt;"

      default:
        throw new Error(`Unsupported type ${type.type}`)
    }
  }
}

export interface RenderContext {
  readonly types?: Array<string>

  readonly object: Item
  readonly property?: Item

  readonly typeItem: Item | null | undefined

  readonly place: TypeNamePlace
}

export class Page {
  readonly items = new Map<string, Item>()

  constructor(readonly file: string, readonly rootClass: string | null, readonly additionalClasses: any) {
  }
}

export interface Item {
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

export function isPrimitiveType(name: string) {
  return name === "string" || name === "boolean"
}

const catharsis = require("catharsis")

function identifierToLink(renderer: Renderer, id: any) {
  if (id === "string") {
    return "String"
  }
  if (id === "boolean") {
    return "Boolean"
  }
  if (id === "number") {
    return "Number"
  }

  let linked = renderer.resolveById(id)
  if (linked == null) {
    if (id === "module:electron-builder/out/core.Arch" || id === "module:builder-util/out/arch.Arch") {
      id = "module:builder-util.Arch"
    }
    else if (id === "module:builder-util-runtime/out/CancellationToken.CancellationToken") {
      id = "module:builder-util-runtime.CancellationToken"
    }
    linked = renderer.resolveById(id)
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
  return `[${linked.name}](${fullLink(renderer, linked)})`
}

function fullLink(renderer: Renderer, linked: any) {
  const relativeName = getAnchorName(renderer, linked)
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

function getAnchorName(renderer: Renderer, item: Item): string {
  if (item.id == null) {
    throw new Error(`Cannot create a link without a id: ${JSON.stringify(item)}`)
  }

  if (item.inherited) {
    const inherits = renderer.resolveById(item.inherits)
    return inherits ? getAnchorName(renderer, inherits) : ""
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