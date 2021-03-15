import * as sax from "sax"
import { newError } from "./index"

export class XElement {
  value = ""
  attributes: { [key: string]: string } | null = null
  isCData = false
  elements: Array<XElement> | null = null

  constructor(readonly name: string) {
    if (!name) {
      throw newError("Element name cannot be empty", "ERR_XML_ELEMENT_NAME_EMPTY")
    }
    if (!isValidName(name)) {
      throw newError(`Invalid element name: ${name}`, "ERR_XML_ELEMENT_INVALID_NAME")
    }
  }

  attribute(name: string): string {
    const result = this.attributes === null ? null : this.attributes[name]
    if (result == null) {
      throw newError(`No attribute "${name}"`, "ERR_XML_MISSED_ATTRIBUTE")
    }
    return result
  }

  removeAttribute(name: string): void {
    if (this.attributes !== null) {
      delete this.attributes[name]
    }
  }

  element(name: string, ignoreCase = false, errorIfMissed: string | null = null): XElement {
    const result = this.elementOrNull(name, ignoreCase)
    if (result === null) {
      throw newError(errorIfMissed || `No element "${name}"`, "ERR_XML_MISSED_ELEMENT")
    }
    return result
  }

  elementOrNull(name: string, ignoreCase = false): XElement | null {
    if (this.elements === null) {
      return null
    }

    for (const element of this.elements) {
      if (isNameEquals(element, name, ignoreCase)) {
        return element
      }
    }

    return null
  }

  getElements(name: string, ignoreCase = false) {
    if (this.elements === null) {
      return []
    }
    return this.elements.filter(it => isNameEquals(it, name, ignoreCase))
  }

  elementValueOrEmpty(name: string, ignoreCase = false): string {
    const element = this.elementOrNull(name, ignoreCase)
    return element === null ? "" : element.value
  }
}

const NAME_REG_EXP = new RegExp(/^[A-Za-z_][:A-Za-z0-9_-]*$/i)

function isValidName(name: string) {
  return NAME_REG_EXP.test(name)
}

function isNameEquals(element: XElement, name: string, ignoreCase: boolean) {
  const elementName = element.name
  return elementName === name || (ignoreCase === true && elementName.length === name.length && elementName.toLowerCase() === name.toLowerCase())
}

export function parseXml(data: string): XElement {
  let rootElement: XElement | null = null
  const parser = sax.parser(true, {})
  const elements: Array<XElement> = []

  parser.onopentag = saxElement => {
    const element = new XElement(saxElement.name)
    element.attributes = saxElement.attributes as { [key: string]: string }

    if (rootElement === null) {
      rootElement = element
    } else {
      const parent = elements[elements.length - 1]
      if (parent.elements == null) {
        parent.elements = []
      }
      parent.elements.push(element)
    }
    elements.push(element)
  }

  parser.onclosetag = () => {
    elements.pop()
  }

  parser.ontext = text => {
    if (elements.length > 0) {
      elements[elements.length - 1].value = text
    }
  }

  parser.oncdata = cdata => {
    const element = elements[elements.length - 1]
    element.value = cdata
    element.isCData = true
  }

  parser.onerror = err => {
    throw err
  }

  parser.write(data)
  return rootElement!
}
