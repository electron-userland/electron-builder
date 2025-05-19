import chalk from "chalk"
import { Ajv, type ErrorObject } from "ajv"
import addFormats from "ajv-formats"
import deref from "json-schema-deref"
import path from "path"
import { Lazy } from "lazy-val"
import { DebugLogger, safeStringifyJson } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { PACKAGE_VERSION } from "../../version.js"
import { Configuration } from "../../configuration.js"
import { readJson } from "fs-extra"
import validateSchema from "@develar/schema-utils"

const schemeDataPromise = new Lazy(() => readJson(path.join(__dirname, "..", "..", "..", "scheme.json")))

export async function validateConfiguration(config: Configuration, debugLogger: DebugLogger) {
  validateSchema(await schemeDataPromise.value, config, {
    name: `electron-builder ${PACKAGE_VERSION}`,
    postFormatter: (formattedError: string, error: any): string => {
      if (debugLogger.isEnabled) {
        debugLogger.add("invalidConfig", safeStringifyJson(error))
      }

      const site = "https://www.electron.build"
      let url = `${site}/configuration`
      const targets = new Set(["mac", "dmg", "pkg", "mas", "win", "nsis", "appx", "linux", "appimage", "snap"])
      const dataPath: string = error.dataPath == null ? null : error.dataPath
      const targetPath = dataPath.startsWith(".") ? dataPath.substring(1).toLowerCase() : null
      if (targetPath != null && targets.has(targetPath)) {
        url = `${site}/${targetPath}`
      }

      return `${formattedError}\n  How to fix:
  1. Open ${url}
  2. Search the option name on the page (or type in into Search to find across the docs).
    * Not found? The option may have been deprecated or no longer exists (check spelling).
    * Found? Check that the option in the appropriate place. e.g. "title" only in the "dmg", not in the root.
`
    },
  })
}

// export const validateConfiguration = async (config: Configuration, debugLogger: DebugLogger): Promise<void> => {
//   const validator = new ConfigurationValidator()
//   await validator.validate(config, debugLogger)
// }

class ConfigurationValidator {
  private readonly pluginName = "electron-builder"
  private readonly schemaFilePath = path.join(__dirname, "..", "..", "..", "scheme.json")

  private readonly schemaDataPromise = new Lazy(async () => readJson(this.schemaFilePath))

  public async validate(config: Configuration, debugLogger: DebugLogger): Promise<void> {
    const ajv = new Ajv({
      allErrors: false,
      strict: false,
      // allowUnionTypes: true,
      coerceTypes: true,
      inlineRefs: true,
    })
    ;(addFormats as any)(ajv)

    const rawSchema = await this.schemaDataPromise.value
    const dereferencedSchema = await this.dereferenceSchema(rawSchema)
    dereferencedSchema.definitions = rawSchema.definitions

    const validate = ajv.compile(dereferencedSchema)
    const valid = validate(config)

    if (valid) {
      return
    }

    if (debugLogger.isEnabled) {
      debugLogger.add("invalidConfig", safeStringifyJson(validate.errors))
    }

    throw new Error(this.formatAjvErrors(dereferencedSchema, validate.errors))
  }

  private dereferenceSchema(schema: any): Promise<any> {
    return new Promise((resolve, reject) => {
      deref(schema, (err, dereferencedSchema) => {
        if (err) {
          reject(err)
        } else {
          resolve(dereferencedSchema)
        }
      })
    })
  }

  private formatAjvErrors(schema: any, errors: ErrorObject[] | Nullish): string {
    if (!errors?.length) {
      return ""
    }

    const header = chalk.red.bold(
      `\nInvalid Configuration.\n${this.pluginName} v${PACKAGE_VERSION} has been initialized using a configuration that does not match the API schema:\n`
    )

    const formattedMessages = errors.map(error => {
      const path = this.formatInstancePath(error.instancePath)
      const message = this.getFriendlyMessage(error, schema)
      const isDeprecated = this.generateTextForNodeAtInstancePath(schema, error.instancePath, node => node.deprecated)
      const isDeprecatedMessage = isDeprecated ? `    ${chalk.gray("↳ Deprecated:")} ${chalk.gray(isDeprecated)}` : ""
      const messageWithDescription = this.generateTextForNodeAtInstancePath(schema, error.instancePath, node => node.description)
      const messageWithDescriptionText = messageWithDescription ? `   ${chalk.gray("↳ Description:")} ${chalk.gray(messageWithDescription)}` : ""
      const messageWithType = this.generateTextForNodeAtInstancePath(schema, error.instancePath, node => node.type)
      const messageWithTypeText = messageWithType ? `   ${chalk.gray("↳ Type:")} ${chalk.gray(messageWithType)}` : ""
      const messageWithEnum = this.generateTextForNodeAtInstancePath(schema, error.instancePath, node => node.enum)
      const messageWithEnumText = messageWithEnum ? `   ${chalk.gray("↳ Enum:")} ${chalk.gray(messageWithEnum)}` : ""
      const messageWithDefault = this.generateTextForNodeAtInstancePath(schema, error.instancePath, node => node.default)
      const messageWithDefaultText = messageWithDefault ? `   ${chalk.gray("↳ Default:")} ${chalk.gray(messageWithDefault)}` : ""

      return [
        ` ${chalk.yellow("•")} ${chalk.cyan(path)} ${chalk.white(message)}`,
        // isDeprecatedMessage,
        // messageWithDescriptionText,
        // messageWithTypeText,
        // messageWithEnumText,
        // messageWithDefaultText,
      ]
        .filter(Boolean)
        .join("\n")
    })

    formattedMessages.push(
      `
    How to fix:
    1. Open https://www.electron.build
    2. Search the option name on the page (or type it into Search to find across the docs).
      * Not found? The option might be deprecated or no longer exists (check spelling).
      * Found? Check that the option is in the appropriate place. e.g. "title" only in the "dmg", not in the root
    `,
      `
    Please ensure that you are using the ${chalk.yellow("latest")} tag of ${this.pluginName} and refer to the documentation for the correct configuration options.
    If continuing to experience issues, consider trying ${chalk.yellow("next")} tag of ${this.pluginName}
    `
    )

    return `${header}${formattedMessages.join("\n")}\n`
  }

  private formatInstancePath(instancePath: string): string {
    if (!instancePath) {
      return "configuration"
    }
    return (
      "configuration" +
      instancePath
        .split("/")
        .filter(Boolean)
        .map(segment => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
        .join("")
    )
  }

  private getFriendlyMessage(error: ErrorObject, schema: any): string {
    if (["anyOf", "oneOf", "allOf"].some(keyword => error.schemaPath.includes(keyword))) {
      const verboseErrorLog = this.getDescriptionAtPath(schema, error.schemaPath, error.keyword)
      if (verboseErrorLog) {
        return verboseErrorLog
      }
    }

    switch (error.keyword) {
      case "type":
        return `should be of type: ${chalk.green(error.params.type)}`
      case "enum":
        return `should be one of: ${chalk.green(error.params.allowedValues?.join(", "))}`
      case "additionalProperties":
        return `has unknown property '${chalk.red(error.params.additionalProperty)}'`
      case "required":
        return `is missing required property '${chalk.red(error.params.missingProperty)}'`
      case "minItems":
        return `should have at least ${chalk.green(error.params.limit)} item(s)`
      case "maxItems":
        return `should have no more than ${chalk.green(error.params.limit)} item(s)`
      case "minLength":
        return `should be at least ${chalk.green(error.params.limit)} character(s) long`
      case "maxLength":
        return `should be no more than ${chalk.green(error.params.limit)} character(s) long`
      case "pattern":
        return `should match the expected pattern: ${chalk.green(error.params.pattern)}`
      case "const":
        return `should be exactly: ${chalk.green(JSON.stringify(error.params.allowedValue))}`
      case "format":
        return `should match format: ${chalk.green(error.params.format)}`
      default:
        return error.message ? `should ${error.message}` : "is invalid"
    }
  }

  private getDescriptionAtPath(schema: any, instancePath: string, keyword: string): string | undefined {
    const segments = instancePath
      .split("/")
      .filter(Boolean)
      .map(s => (/^\d+$/.test(s) ? Number(s) : s))
    let current = schema

    for (const segment of segments) {
      if (typeof segment === "string") {
        current = current.properties?.[segment] ?? current
      } else if (typeof segment === "number" && Array.isArray(current.items)) {
        current = current.items[segment]
      } else if (current.items) {
        current = current.items
      }
    }

    const schemaOfArray = current?.[keyword]
    if (!Array.isArray(schemaOfArray) || schemaOfArray.length === 0) {
      return undefined
    }

    return [
      `\n   ${chalk.gray("↳ ")} ${chalk.white(`Property follows type "${keyword}":`)}`,
      ...Object.entries(schemaOfArray).map(([key, value]: [string, any]) => {
        if (value.$ref) {
          return `    - ${key}: reference to ${decodeURIComponent(value.$ref)}`
        }
        if (value.type) {
          return `    - ${key}: type: ${value.type}`
        }
        return `    - ${key}: \n${JSON.stringify(value, null, 2)
          .split("\n")
          .map(line => `      ${line}`)
          .join("\n")}`
      }),
    ].join("\n")
  }

  private generateTextForNodeAtInstancePath(schema: any, instancePath: string, generator: (schemaNode: any) => string): string | undefined {
    const segments = instancePath
      .split("/")
      .filter(Boolean)
      .map(s => (/^\d+$/.test(s) ? Number(s) : s))
    let current = schema
    let lastDescription: string | undefined

    for (const segment of segments) {
      if (!current) {
        return lastDescription
      }
      if (typeof current.description === "string") {
        lastDescription = generator(current)
      }

      if (typeof segment === "string") {
        if (current.type === "object" && current.properties?.[segment]) {
          current = current.properties[segment]
          continue
        }

        const complex = current.anyOf || current.oneOf || current.allOf
        if (Array.isArray(complex)) {
          for (const sub of complex) {
            if (sub.properties?.[segment]) {
              current = sub.properties[segment]
              break
            }
          }
          continue
        }

        return lastDescription
      }

      if (typeof segment === "number") {
        if (current.type === "array") {
          current = Array.isArray(current.items) ? current.items[segment] : current.items
          continue
        }

        return lastDescription
      }
    }

    return generator(current) ?? lastDescription
  }
}
