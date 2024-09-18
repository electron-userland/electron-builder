import { Application, Renderer } from "typedoc"

import { Context, Converter, DeclarationReflection, Reflection, ReflectionKind } from "typedoc"

export const load = (app: Application) => {
  new NoInheritPlugin(app).initialize()
}

class FilterInheritPlugin {
  constructor(private readonly app: Application) {}

  initialize() {
    this.app.renderer.on(Renderer.EVENT_END_PAGE, async context => {
      // Filter out properties that are Inherited. It causes too much visual noise and there's already the Extends code block
      const content = context
        .contents!.split("\n")
        .reduce((prev, curr, _index, _arr) => {
          const isInheritedProperty = /\|.*\[.*\]\(.*\).*\|/.test(curr)
          if (!isInheritedProperty) {
            return [...prev, curr]
          }
          return prev
        }, [] as string[])
        .join("\n")

      // await mkdir(path.dirname(context.filename), { recursive: true })
      // await writeFile(context.filename, content)
    })
  }
}

/**
 * A handler that deals with inherited reflections.
 */
export class NoInheritPlugin {
  /**
   * A list of reflections that are inherited from a super.
   */
  private inheritedReflections: DeclarationReflection[] = []

  constructor(private readonly app: Application) {}
  initialize() {
    this.app.converter.on(Converter.EVENT_BEGIN, this.onBegin.bind(this))
    this.app.converter.on(Converter.EVENT_CREATE_DECLARATION, this.onDeclaration.bind(this), -1100) // after ImplementsPlugin
    this.app.converter.on(Converter.EVENT_RESOLVE_BEGIN, this.onBeginResolve.bind(this))
  }

  /**
   * Triggered when the converter begins converting a project.
   */
  private onBegin(context: Context) {
    this.inheritedReflections = []
  }

  /**
   * Triggered when the converter has created a declaration or signature reflection.
   * Builds the list of classes/interfaces for the list of reflections that are inherited that could end up being removed.
   */
  private onDeclaration(context: Context, reflection: Reflection) {
    if (reflection instanceof DeclarationReflection) {
      if (
        reflection.inheritedFrom &&
        reflection.parent &&
        reflection.parent.kindOf(ReflectionKind.ClassOrInterface) &&
        (!reflection.overwrites || (reflection.overwrites && reflection.overwrites !== reflection.inheritedFrom))
      ) {
        this.inheritedReflections.push(reflection)
      }
    }
  }

  /**
   * Triggered when the converter begins resolving a project.
   * Goes over the list of inherited reflections and removes any that are down the hierarchy
   * from a class that doesn't inherit docs.
   */
  private onBeginResolve(context: Context) {
    const project = context.project
    const removals: DeclarationReflection[] = []

    this.inheritedReflections.forEach(reflection => {
      if (this.isInherited(context, reflection)) {
        removals.push(reflection)
      }
    })

    removals.forEach(removal => {
      project.removeReflection(removal)
    })
  }

  private isInherited(context: Context, current: Reflection): boolean {
    const parent = current.parent as DeclarationReflection
    if (!parent) {
      return false
    }
    return true
  }
}
