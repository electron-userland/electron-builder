import { isPrimitiveType, Item, Renderer, renderMemberName, TypeNamePlace } from "./main"

// mkdocs requires 4 spaces (not 2 as git book) for items of nested list
const nestedSpace = "    "

export function renderProperties(renderer: Renderer, object: Item, level = 0) {
  let result = ""

  let firstDocumentedParent = null
  const parents = object.augments
  if (parents != null) {
    for (const parentId of parents) {
      if (!parentId.endsWith("TargetSpecificOptions") && !parentId.endsWith("CommonLinuxOptions") && !parentId.endsWith("CommonNsisOptions") && !parentId.endsWith("PublishConfiguration")) {
        if (firstDocumentedParent == null && !parentId.endsWith("PlatformSpecificBuildOptions")) {
          firstDocumentedParent = renderer.resolveById(parentId)
        }
      }
    }
  }

  let indent = ""
  for (let d = 0; d < level; d++) {
    indent += nestedSpace
  }

  // for level 0 "Extends" is printed
  if (level > 0 && firstDocumentedParent != null) {
    result += `${indent}Inherits ${renderer.renderTypeName({typeItem: firstDocumentedParent, object, place: TypeNamePlace.INHERITS})} options.\n`
  }

  const doRenderProperties = (properties: Array<Item>) => {
    const first = properties[0]
    for (const member of properties) {
      if (member !== first) {
        // mkdocs requires second new line for items of nested list
        result += "\n"
      }

      if (renderer.isInsertHorizontalLineBefore(member)) {
        result += "\n---\n\n"
      }

      result += indent + "* " + renderMemberName(member, object)

      const types = member.type.names
      let child = getInlinedChild(types, renderer)
      const propertyTypeItem = child
      if (child != null && (!child.inlined || child.rendered)) {
        child = null
      }

      if (child == null || types.some(it => it.startsWith("Array.<") || isPrimitiveType(it))) {
        const renderedTypeName = renderer.renderTypeName({types, property: member, typeItem: propertyTypeItem, object, place: TypeNamePlace.PROPERTY})
        if (renderedTypeName !== "" && renderedTypeName != null) {
          result += " " + renderedTypeName
        }
      }

      if (child != null) {
        // noinspection HtmlDeprecatedAttribute
        result += `<a name="${child.name}"></a>`
      }

      let description = member.description
      if (propertyTypeItem != null && !description) {
        description = propertyTypeItem.description
      }

      if (description) {
        result += " - " + renderMemberListDescription(description, indent + nestedSpace)
      }

      if (child != null) {
        child.rendered = true
        result += "\n"
        result += renderProperties(renderer, child, level + 1)
      }
    }
  }

  const renderParentProperties = (isPrintInherits: boolean) => {
    // no need to show MacConfiguration options for MasConfiguration
    if (parents != null && level === 0 && object.name !== "MasConfiguration") {
      for (const parentId of parents) {
        const parent = renderer.resolveById(parentId)
        if (parent == null) {
          console.log(`Unresolved parent \`${parentId}\``)
          continue
        }

        const parentProperties = parent.properties.filter(parentProperty => !object.properties.some(it => it.name === parentProperty.name))
        if (parentProperties.length === 0) {
          continue
        }

        if (isPrintInherits) {
          const renderedName = renderer.renderTypeName({object, typeItem: parent, place: TypeNamePlace.INHERITED_FROM})
          if (renderedName == null) {
            continue
          }

          result += "\n"

          if (renderedName.length > 0) {
            result += `\nInherited from ${renderedName}:\n\n`
          }
        }

        doRenderProperties(parentProperties)
      }
    }
  }

  const isRenderParentPropertiesBefore = renderer.isRenderParentPropertiesBefore(object)
  if (isRenderParentPropertiesBefore) {
    renderParentProperties(false)
    result += "\n"
  }

  doRenderProperties(object.properties)

  if (!isRenderParentPropertiesBefore) {
    renderParentProperties(true)
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

function getInlinedChild(types: Array<string>, renderer: Renderer) {
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

  if (types.length === 1 && types[0].startsWith(arrayTypePrefix)) {
    types[0] = types[0].substring(arrayTypePrefix.length, types[0].indexOf(">"))
  }

  return types.length === 1 ? renderer.resolveById(types[0]) : null
}

const dmdHelper = require("dmd/helpers/helpers")

function renderMemberListDescription(text: string, indent: string) {
  let data: string = dmdHelper.inlineLinks(text)
    .replace(/<br>/g, "\n")
    .replace(/\n/g, "\n" + indent)
    .replace(new RegExp("\\*{2}\\\\/", "g"), "**/")
    .trim()
  if (data.includes("\n")) {
    // mkdocs requires newline for multi line list item text (otherwise next item on the same line and rendered as list item)
    data += "\n"
  }
  return data
}