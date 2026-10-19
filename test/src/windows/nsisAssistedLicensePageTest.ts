import * as fs from "fs/promises"
import * as path from "path"

// Choosing "for all users" on the install mode page without admin rights relaunches the assisted installer elevated (UAC inner
// instance), which runs the pages from the start again. The license page comes before the install mode page, so it was already
// accepted in the outer instance and must not be shown a second time (#10340).
const templatePath = path.join(__dirname, "../../../packages/app-builder-lib/templates/nsis/assistedInstaller.nsh")

test("assisted installer skips the already accepted license page once in the elevated instance", async ({ expect }) => {
  const template = await fs.readFile(templatePath, "utf8")
  const licensePage = template.match(/!ifmacrodef licensePage[\s\S]*?!endif/)?.[0] ?? ""
  const licensePagePre = licensePage.match(/Function licensePagePre[\s\S]*?FunctionEnd/)?.[0] ?? ""

  // only pages before the install mode page were shown by the outer instance
  expect(template.indexOf("!insertmacro licensePage")).toBeLessThan(template.indexOf("!insertmacro PAGE_INSTALL_MODE"))

  expect(licensePage).toMatch(/!define MUI_PAGE_CUSTOMFUNCTION_PRE licensePagePre\s+!insertmacro licensePage/)
  // skipPageIfUpdated defines its own PRE callback and knows nothing about the elevated instance
  expect(licensePage).not.toContain("skipPageIfUpdated")

  // still skipped when updating
  expect(licensePagePre).toMatch(/\$\{if\} \$\{isUpdated\}\s+Abort/)
  // skipped only on the way in: NSIS closes the installer when Back reaches a page with every page before it skipped
  expect(licensePagePre).toMatch(
    /\$\{if\} \$\{UAC_IsInnerInstance\}\s+\$\{andIf\} \$isLicensePageSkippedInInnerInstance != "1"\s+StrCpy \$isLicensePageSkippedInInnerInstance "1"\s+Abort/
  )
})
