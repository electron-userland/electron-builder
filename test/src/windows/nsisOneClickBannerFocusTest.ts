import * as fs from "fs/promises"
import * as path from "path"

const installSection = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis/installSection.nsh")

function statements(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "" && !line.startsWith("#") && !line.startsWith(";"))
}

// SpiderBanner hides the InstFiles page while keyboard focus is still on one of its controls; pressing Tab then hangs the
// one-click installer (#7526). installSection.nsh must move focus to the banner's status text right after the banner is set up,
// before the installer does anything slow (the first of which is checking whether the app is running).
test("one-click installSection.nsh moves keyboard focus onto the SpiderBanner status text", async ({ expect }) => {
  const section = statements(await fs.readFile(installSection, "utf8"))

  const show = section.findLastIndex(line => line.startsWith("SpiderBanner::Show"))
  expect(show).toBeGreaterThanOrEqual(0)

  const statusText = section.indexOf("GetDlgItem $0 $0 1000", show)
  const focus = section.indexOf("SendMessage $hwndparent ${WM_NEXTDLGCTL} $0 1", show)
  const appRunningCheck = section.indexOf("!insertmacro CHECK_APP_RUNNING", show)

  expect(statusText).toBeGreaterThan(show)
  expect(focus).toBeGreaterThan(statusText)
  expect(appRunningCheck).toBeGreaterThan(focus)

  // $0 must still hold the status text control when focus is moved to it, so nothing in between may overwrite it.
  const between = section.slice(statusText + 1, focus)
  expect(between.filter(line => /^(StrCpy|GetDlgItem|FindWindow|Pop|IntOp|ReadRegStr)\s+\$0\b/.test(line))).toEqual([])
})
