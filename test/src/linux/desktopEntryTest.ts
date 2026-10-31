import { LinuxDesktopFile } from "app-builder-lib"
import { LinuxTargetHelper } from "app-builder-lib/src/targets/linux/LinuxTargetHelper"
import { InvalidConfigurationError } from "builder-util"

interface Options {
  category?: string
  mimeTypes?: Array<string>
}

// computeDesktopEntry is shared by every Linux target that writes a .desktop file. The packager is reduced to what it reads;
// desktopName and category are set to keep it from warning. Not async itself, so that a synchronous throw would show.
function computeDesktopEntry(desktop: LinuxDesktopFile, options: Options = {}): Promise<string> {
  const packager = {
    appInfo: { productName: "Test App", sanitizedProductName: "Test App", description: "" },
    metadata: { desktopName: "com.example.TestApp" },
    executableName: "test-app",
    fileAssociations: [],
    config: {},
    platformOptions: {},
  }
  return new LinuxTargetHelper(packager as any).computeDesktopEntry({ category: "Utility", ...options, desktop }, "test-app %U")
}

const rejection = (desktop: LinuxDesktopFile, options?: Options): Promise<Error> =>
  computeDesktopEntry(desktop, options).then(
    () => {
      throw new Error("the desktop entry was computed")
    },
    (e: Error) => e
  )

test("localized keys, escape sequences, keys parsers accept and non-string values are written as given", async ({ expect }) => {
  const entry = await computeDesktopEntry({
    entry: { "Name[de]": "Testanwendung", "Comment[sr@latin]": "Probna aplikacija", "X-Foo": "a\\;b;c", X_Bar: "kept", Terminal: true as any },
    desktopActions: { NewWindow: { Name: "New Window", "Name[de]": "Neues Fenster", Exec: "test-app --new-window" } },
  })
  expect(entry).toContain("\nName[de]=Testanwendung\n")
  expect(entry).toContain("\nComment[sr@latin]=Probna aplikacija\n")
  expect(entry).toContain("\nX-Foo=a\\;b;c\n")
  expect(entry).toContain("\nX_Bar=kept\n")
  expect(entry).toContain("\nTerminal=true\n")
  expect(entry).toContain("\n[Desktop Action NewWindow]\nName=New Window\nName[de]=Neues Fenster\nExec=test-app --new-window\n")
})

test.for<[string, LinuxDesktopFile, Options, string]>([
  ["an entry value with \\n", { entry: { Keywords: "a;\nExec=evil" } }, {}, "Keywords in the [Desktop Entry] group"],
  ["an entry value with \\r", { entry: { Keywords: "a;\rb;" } }, {}, "Keywords in the [Desktop Entry] group"],
  ["a localized entry value", { entry: { "Name[de]": "Test\nApp" } }, {}, "Name[de] in the [Desktop Entry] group"],
  ["an action value", { desktopActions: { NewWindow: { Name: "New\nWindow" } } }, {}, "Name in the [Desktop Action NewWindow] group"],
  ["linux.category", {}, { category: "Utility;\nExec=evil" }, "Categories in the [Desktop Entry] group"],
  ["linux.mimeTypes", {}, { mimeTypes: ["application/x-foo\nExec=evil"] }, "MimeType in the [Desktop Entry] group"],
])("a line break in %s is rejected", async ([, desktop, options, where], { expect }) => {
  const error = await rejection(desktop, options)
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error.message).toContain(`The value of ${where} of the .desktop file contains a line break`)
})

// each of these fails g_key_file_is_key_name, which makes GLib reject the whole file
test.for(["Foo=Bar", "Exec\nX", "Exec\rX", "", " ", "\t", "Name[de", "Na]me", "Name[]", "Name[de][fr]", "Name[d\ne]", "Name[a=b]", "Name[de DE]", "Name [de]", "[de]"])(
  "the key %j is rejected",
  async (key, { expect }) => {
    for (const [desktop, group] of [
      [{ entry: { [key]: "x" } }, "[Desktop Entry]"],
      [{ desktopActions: { NewWindow: { [key]: "x" } } }, "[Desktop Action NewWindow]"],
    ] as const) {
      const error = await rejection(desktop)
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.message).toContain(`Invalid key ${JSON.stringify(key)} in the ${group} group`)
    }
  }
)

test.for(["New[Window", "New]Window", "New\nWindow", "New\tWindow", "New\x00Window", "New\x7fWindow"])("the action name %j is rejected", async (name, { expect }) => {
  const error = await rejection({ desktopActions: { [name]: { Name: "New Window" } } })
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error.message).toContain(`Invalid desktop action name ${JSON.stringify(name)}`)
})

// GLib trims the blanks around a key and treats a blank line as a comment, so these are read back as configured
test("blanks around a key and line breaks at the end of a value are accepted", async ({ expect }) => {
  const entry = await computeDesktopEntry({ entry: { " X-Padded\t": "x", Keywords: "foo;bar;\n", "Comment[de]": "Kommentar\r\n\n" } })
  expect(entry).toContain("\n X-Padded\t=x\n")
  expect(entry).toContain("\nKeywords=foo;bar;\n")
  expect(entry).toContain("\nComment[de]=Kommentar\n")
  expect(entry).not.toContain("\n\n\n")
})

// computeDesktopEntry is async, so that the AppImage target, which starts other steps next to it, gets a rejected promise
test("a configuration error rejects the promise instead of throwing", ({ expect }) => {
  let result: Promise<string> | undefined
  expect(() => {
    result = computeDesktopEntry({ entry: { "Foo=Bar": "x" } })
  }).not.toThrow()
  return expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
})
