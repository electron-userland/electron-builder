import * as fs from "fs/promises"
import * as path from "path"

const portableScript = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis/portable.nsi")

// The portable launcher extracts the app into $INSTDIR and starts it with ExecWait, which hands the string to CreateProcess.
// An unquoted path with spaces lets CreateProcess try shorter prefixes of it first (e.g. "C:\Users\John" for "C:\Users\John Doe\..."),
// so the executable path must be wrapped in literal double quotes, with the forwarded arguments outside them.
test("portable.nsi quotes the app executable path passed to ExecWait", async ({ expect }) => {
  const script = await fs.readFile(portableScript, "utf8")
  const launches = script
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("ExecWait "))

  expect(launches).toEqual(['ExecWait "$\\"$INSTDIR\\${APP_EXECUTABLE_FILENAME}$\\" $R0" $0'])
})
