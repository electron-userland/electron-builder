import { getTemplatePath } from "app-builder-lib/src/util/pathManager"
import { execFile } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"
import { describe, test } from "vitest"

// Runs the default deb/rpm/pacman after-install script with stubbed system tools on PATH and checks
// which mode it gives chrome-sandbox. Needs bash and /proc/self/ns/user, so Linux only.

const STUBS: Record<string, string> = {
  chmod: `echo "chmod $*" >> "$STUB_LOG"`,
  ln: `echo "ln $*" >> "$STUB_LOG"`,
  // a user namespace check that behaves like kernel.unprivileged_userns_clone: root may be exempt, nobody is not
  unshare: `echo "unshare $* as=\${AS_NOBODY:+nobody}" >> "$STUB_LOG"
if [ -n "$AS_NOBODY" ]; then exit "$NOBODY_RC"; fi
exit "$ROOT_RC"`,
  setpriv: `echo "setpriv $*" >> "$STUB_LOG"
while [ "\${1#--}" != "$1" ]; do shift; done
AS_NOBODY=1 exec "$@"`,
}

async function renderAfterInstall(): Promise<string> {
  const values: Record<string, string> = { executable: "testapp", sanitizedProductName: "Test App" }
  const template = await fs.readFile(path.join(getTemplatePath("linux"), "after-install.tpl"), "utf8")
  // same macro substitution as writeConfigFile in FpmTarget.ts
  return template.replace(/\${([a-zA-Z]+)}/g, (_match, name: string) => {
    if (!(name in values)) {
      throw new Error(`Macro ${name} is not defined`)
    }
    return values[name]
  })
}

async function runAfterInstall(dir: string, options: { rootRc: number; nobodyRc: number; withSetpriv: boolean }): Promise<Array<string>> {
  const binDir = path.join(dir, "bin")
  await fs.mkdir(binDir)
  for (const [name, body] of Object.entries(STUBS)) {
    if (name === "setpriv" && !options.withSetpriv) {
      continue
    }
    await fs.writeFile(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  }
  const script = path.join(dir, "after-install.sh")
  await fs.writeFile(script, await renderAfterInstall())
  const log = path.join(dir, "stub.log")
  await promisify(execFile)("/bin/bash", [script], {
    env: { PATH: binDir, STUB_LOG: log, ROOT_RC: String(options.rootRc), NOBODY_RC: String(options.nobodyRc) },
  })
  return (await fs.readFile(log, "utf8")).trim().split("\n")
}

describe.skipIf(process.platform !== "linux")("after-install.tpl chrome-sandbox mode", () => {
  test("keeps chrome-sandbox non-setuid when unprivileged users can create user namespaces", async ({ expect, tmpDir }) => {
    const calls = await runAfterInstall(await tmpDir.createTempDir(), { rootRc: 0, nobodyRc: 0, withSetpriv: true })
    expect(calls).toContain("setpriv --reuid=65534 --regid=65534 --clear-groups unshare --user true")
    expect(calls).toContain("unshare --user true as=nobody")
    expect(calls).toContain("chmod 0755 /opt/Test App/chrome-sandbox")
  })

  test("makes chrome-sandbox setuid when only root can create user namespaces", async ({ expect, tmpDir }) => {
    const calls = await runAfterInstall(await tmpDir.createTempDir(), { rootRc: 0, nobodyRc: 1, withSetpriv: true })
    expect(calls).toContain("chmod 4755 /opt/Test App/chrome-sandbox")
    expect(calls).not.toContain("chmod 0755 /opt/Test App/chrome-sandbox")
  })

  test("makes chrome-sandbox setuid when nobody can create user namespaces", async ({ expect, tmpDir }) => {
    const calls = await runAfterInstall(await tmpDir.createTempDir(), { rootRc: 1, nobodyRc: 1, withSetpriv: true })
    expect(calls).toContain("chmod 4755 /opt/Test App/chrome-sandbox")
  })

  test("makes chrome-sandbox setuid when setpriv is not installed to check as an unprivileged user", async ({ expect, tmpDir }) => {
    const calls = await runAfterInstall(await tmpDir.createTempDir(), { rootRc: 0, nobodyRc: 0, withSetpriv: false })
    expect(calls.filter(call => call.startsWith("unshare"))).toEqual([])
    expect(calls).toContain("chmod 4755 /opt/Test App/chrome-sandbox")
    expect(calls).not.toContain("chmod 0755 /opt/Test App/chrome-sandbox")
  })
})
