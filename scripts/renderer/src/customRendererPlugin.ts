import { Application, Renderer } from "typedoc";
export const ALLOW_INHERIT_OPTIONS = "allowInheritedDoc";

export const load = (app: Application) => {
  new FilterInheritPlugin(app).initialize()
};

class FilterInheritPlugin {
  constructor(private readonly app: Application) {
  }

  initialize() {
    this.app.renderer.on(Renderer.EVENT_END_PAGE, async (context) => {
      // Filter out properties that are Inherited. It causes too much visual noise and there's already the Extends code block
      const content = context.contents!.split("\n").reduce((prev, curr, _index, _arr) => {
        const isInheritedProperty = /\|.*\[.*\]\(.*\).*\|/.test(curr);
        if (!isInheritedProperty) {
          return [...prev, curr]
        }
        return prev
      }, [] as string[]).join("\n")

      // await mkdir(path.dirname(context.filename), { recursive: true })
      // await writeFile(context.filename, content)
    })
  }
}