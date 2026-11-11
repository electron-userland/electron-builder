import { VmManager } from "app-builder-lib/internal"
import { serializeToYaml } from "builder-util"
import { execFile } from "child_process"
import { outputFile } from "fs-extra"
import * as http from "http"
import path from "path"
import type { TmpDir } from "temp-file"
import { promisify } from "util"
import { afterEach, describe, ExpectStatic, test } from "vitest"
import { createLocalServer, insecureFeedEnv, launchAndWaitForQuit, LocalServer } from "../helpers/launchAppCrossPlatform"
import { trustSigningIdentityInMachineRoot } from "../helpers/windowsSignedFixture"
import { authenticodeStubCalls, countOf, fixtureEnv, leftoverPartialDownloads, NOT_LOOPBACK_LOCALHOST_NAME } from "./blackboxFixtureEnv"
import { BlackboxServers, expectRejectedUpdate, MANIFEST_VERIFICATION_DISABLED_MARKER, runTestWithinServer, ScenarioContext } from "./blackboxUpdateHelpers"

// The pieces of the blackbox update harness that need no packaged app: the local update server, the env of a launch, the updater
// knobs of the test app fixture, and the checks of a refused update launch.

const localServers: Array<LocalServer> = []
afterEach(() => {
  for (const { server } of localServers.splice(0)) {
    server.closeAllConnections()
    server.close()
  }
})

async function serve(tmpDir: TmpDir, files: Record<string, string | Buffer> = {}): Promise<LocalServer> {
  const root = await tmpDir.getTempDir({ prefix: "local-server" })
  for (const [name, content] of Object.entries(files)) {
    await outputFile(path.join(root, name), content)
  }
  const server = await createLocalServer(root)
  localServers.push(server)
  return server
}

// one connection per request, closed after it
function get(url: string, headers: http.OutgoingHttpHeaders = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers, agent: false }, response => {
        const chunks: Array<Buffer> = []
        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }))
        response.on("error", reject)
      })
      .on("error", reject)
  })
}

async function servedUpdateConfig(tmpDir: TmpDir, url: string): Promise<string> {
  const file = path.join(await tmpDir.getTempDir({ prefix: "served-update-config" }), "app-update.yml")
  await outputFile(file, serializeToYaml({ provider: "generic", url }))
  return file
}

// A Windows VM whose launches record their PowerShell command and print what `answer` returns for it, the installed version by default
class ScriptedVm extends VmManager {
  readonly commands: Array<string> = []
  private readonly answer: (command: string) => Promise<string>

  constructor(answer: (command: string) => Promise<string> = () => Promise.resolve("APP_VERSION: 1.0.0")) {
    super()
    this.answer = answer
  }

  override exec(_file: string, args: Array<string>): Promise<string> {
    const command = args[args.length - 1]
    this.commands.push(command)
    return this.answer(command)
  }
}

describe("createLocalServer", () => {
  test("records each request by its decoded pathname, header names and status, never by a header value", async ({ expect, tmpDir }) => {
    const server = await serve(tmpDir, { "TestApp Setup.exe": "installer" })
    const response = await get(`${server.url}/TestApp%20Setup.exe?noCache=1`, { Authorization: "Bearer e2e-secret", "X-Tenant": "acme" })
    expect(response.status).toBe(200)
    expect(response.body.toString()).toBe("installer")

    await server.settled()
    expect(server.requests).toEqual([{ pathname: "/TestApp Setup.exe", headerNames: expect.arrayContaining(["authorization", "host", "x-tenant"]), status: 200, aborted: false }])
    const [{ headerNames }] = server.requests
    expect(headerNames).toEqual([...headerNames].sort())
    expect(JSON.stringify(server.requests)).not.toMatch(/e2e-secret|acme/)

    server.clearRequests()
    expect(server.requests).toEqual([])
  })

  test("a router redirects a request or appends bytes to the file, from the next request on", async ({ expect, tmpDir }) => {
    const installer = Buffer.from("installer")
    const server = await serve(tmpDir, { "latest.yml": "version: 1.0.1", "TestApp Setup.exe": installer })
    server.setRouter(pathname => {
      if (pathname === "/latest.yml") {
        return { redirectTo: "http://127.0.0.1:1/latest.yml" }
      }
      return pathname === "/TestApp Setup.exe" ? { extraBytes: 3 } : null
    })

    expect(await get(`${server.url}/latest.yml?noCache=1`)).toMatchObject({ status: 302, headers: { location: "http://127.0.0.1:1/latest.yml", "content-length": "0" } })
    const extended = await get(`${server.url}/TestApp%20Setup.exe`)
    expect(extended.headers["content-length"]).toBe(String(installer.length + 3))
    expect(extended.body).toEqual(Buffer.concat([installer, Buffer.alloc(3)]))
    // a range request is served from the file alone
    const range = await get(`${server.url}/TestApp%20Setup.exe`, { Range: "bytes=0-3" })
    expect(range.status).toBe(206)
    expect(range.body).toEqual(installer.subarray(0, 4))

    server.setRouter(null)
    expect((await get(`${server.url}/latest.yml`)).body.toString()).toBe("version: 1.0.1")
    await server.settled()
    expect(server.requests.map(it => it.status)).toEqual([302, 200, 206, 200])
  })

  test("settled() waits until every response closed, and a client that went away mid-body is recorded as aborted", async ({ expect, tmpDir }) => {
    // far more than the socket buffers hold (auto-tuned up to 16 MB on Windows), so that the server cannot write all of it to a client that
    // does not read
    const server = await serve(tmpDir, { "TestApp.zip": Buffer.alloc(64 * 1024 * 1024) })
    const request = http.get(`${server.url}/TestApp.zip`, { agent: false })
    await new Promise<void>((resolve, reject) => {
      request.once("response", response => {
        response.pause()
        resolve()
      })
      request.once("error", reject)
    })
    let isSettled = false
    const settled = server.settled().then(() => {
      isSettled = true
    })
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(isSettled).toBe(false)

    request.destroy()
    await settled
    expect(server.requests).toEqual([{ pathname: "/TestApp.zip", headerNames: expect.any(Array), status: 200, aborted: true }])
  })
})

describe("runTestWithinServer", () => {
  test("serves the root directory from the feed and from every origin a scenario creates, and closes all of them", async ({ expect }) => {
    const scenarioServers: Array<BlackboxServers> = []
    await runTestWithinServer(async (rootDirectory, _updateConfigPath, serverConfig, servers) => {
      scenarioServers.push(servers)
      await outputFile(path.join(rootDirectory, "latest.yml"), "version: 1.0.1")
      const origin = await servers.createOrigin()
      expect(servers.origins).toEqual([origin])
      expect(servers.feed.url).toBe(serverConfig.url)
      // another port of the same host: another origin
      expect(new URL(origin.url).hostname).toBe(new URL(serverConfig.url).hostname)
      expect(origin.url).not.toBe(serverConfig.url)
      for (const url of [serverConfig.url, origin.url]) {
        expect((await get(`${url}/latest.yml`)).body.toString()).toBe("version: 1.0.1")
      }
    })
    const [{ feed, origins }] = scenarioServers
    expect([feed, ...origins].map(it => it.server.listening)).toEqual([false, false])
  })
})

describe("insecureFeedEnv", () => {
  test.for([
    { url: "http://127.0.0.1:8080", isInsecure: false },
    { url: "http://localhost:8080", isInsecure: false },
    { url: "http://[::1]:8080", isInsecure: false },
    { url: "https://updates.example.com", isInsecure: false },
    { url: `http://${NOT_LOOPBACK_LOCALHOST_NAME}:8080`, isInsecure: true },
    // the Parallels host IP of VM mode
    { url: "http://10.211.55.2:8080", isInsecure: true },
  ])("a feed at $url", async ({ url, isInsecure }, { expect, tmpDir }) => {
    expect(insecureFeedEnv(await servedUpdateConfig(tmpDir, url))).toEqual(isInsecure ? { AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED: "true" } : {})
  })

  test("is passed to every launch, under the launch's own env: a VM launch with a feed on the host IP", async ({ expect, tmpDir }) => {
    const vm = new ScriptedVm()
    const launch = async (url: string, env?: Record<string, string>): Promise<string> => {
      await launchAndWaitForQuit({ appPath: "C:\\TestApp\\TestApp.exe", vm, updateConfigPath: await servedUpdateConfig(tmpDir, url), packageManagerToTest: "", env })
      return vm.commands[vm.commands.length - 1]
    }

    expect(await launch("http://10.211.55.2:8080")).toContain("$env:AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED='true'")
    const refused = await launch("http://10.211.55.2:8080", fixtureEnv({ allowInsecureFeed: false }))
    expect(refused).toContain("$env:AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED='false'")
    expect(refused).not.toContain("AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED='true'")
    expect(await launch("http://127.0.0.1:8080")).not.toContain("AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED")
  })
})

describe("expectRejectedUpdate", () => {
  const REFUSED_LAUNCH = "APP_VERSION: 1.0.0\nError in auto-updater: Error: The download is larger than declared { code: 'ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED' }"
  const REFUSAL = { installedVersion: "1.0.0", expectedErrorCode: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED" }

  // a scenario through a VM whose app prints `updateLaunch()` for the launch that checks for the update, and the installed version for
  // the probe after it
  async function scenario(expect: ExpectStatic, tmpDir: TmpDir, updateLaunch: () => Promise<string>): Promise<{ ctx: ScenarioContext; vm: ScriptedVm }> {
    const feed = await serve(tmpDir)
    const origin = await serve(tmpDir)
    const vm = new ScriptedVm(command => (command.includes("$env:AUTO_UPDATER_TEST='1'") ? updateLaunch() : Promise.resolve("APP_VERSION: 1.0.0")))
    const ctx: ScenarioContext = {
      expect,
      vm,
      appPath: "C:\\TestApp\\TestApp.exe",
      outDirs: [],
      packageManager: "",
      rootDirectory: "",
      updateConfigPath: await servedUpdateConfig(tmpDir, feed.url),
      serverConfig: { provider: "generic", url: feed.url },
      servers: { feed, origins: [origin], createOrigin: () => Promise.reject(new Error("not used")) },
    }
    return { ctx, vm }
  }

  test("only unsigned manifests may be logged as unverified", async ({ expect, tmpDir }) => {
    const { ctx } = await scenario(expect, tmpDir, () => Promise.resolve(`${REFUSED_LAUNCH}\n[updater warn] Update manifest signature verification is disabled`))
    await expectRejectedUpdate(ctx, { ...REFUSAL, manifests: "unsigned" })
    await expect(expectRejectedUpdate(ctx, REFUSAL)).rejects.toThrow(`not to contain '${MANIFEST_VERIFICATION_DISABLED_MARKER}'`)
  })

  test("expectNoRequests fails on a request of the refused launch to the feed or an origin, not on one before it", async ({ expect, tmpDir }) => {
    const launchRequests: Array<string> = []
    const { ctx, vm } = await scenario(expect, tmpDir, async () => {
      for (const url of launchRequests) {
        await get(url)
      }
      return REFUSED_LAUNCH
    })
    const options = { ...REFUSAL, expectNoRequests: true, env: fixtureEnv({ crossOriginHeaders: "unset" }) }
    await get(`${ctx.servers.feed.url}/latest.yml`)
    await expectRejectedUpdate(ctx, options)
    expect(vm.commands[0]).toContain("$env:AUTO_UPDATER_TEST_CROSS_ORIGIN_HEADERS='unset'")

    launchRequests.push(`${ctx.servers.origins[0].url}/TestApp.zip`)
    await expect(expectRejectedUpdate(ctx, options)).rejects.toThrow("/TestApp.zip")
  })
})

describe("updater knobs of the test app fixture", () => {
  const FIXTURE_INDEX = path.join(__dirname, "../../fixtures/test-app/app/index.js")
  const FIXTURE_STUBS = path.join(__dirname, "fixtureAppStubs.cjs")
  const UPDATER_MARKER = "FIXTURE_UPDATER: "

  // what the fixture configured on autoUpdater when the install at launch reads it, as fixtureAppStubs.cjs reports it
  interface FixtureUpdater {
    crossOriginHeaders: Array<string> | null
    requestHeaders: Record<string, string> | null
    allowInsecureFeed: boolean | null
    publisherName: string | null
    autoInstallEvent: string | null
    authenticodeStub: { response: string } | null
    checkedForUpdates: boolean
    waitUntilNextLaunch: boolean | null
  }

  const DEFAULT_UPDATER: FixtureUpdater = {
    crossOriginHeaders: [],
    requestHeaders: null,
    allowInsecureFeed: null,
    publisherName: null,
    autoInstallEvent: "onQuit",
    authenticodeStub: null,
    checkedForUpdates: true,
    waitUntilNextLaunch: false,
  }

  // runs the fixture's update launch under plain node, with electron, sqlite3 and electron-updater stubbed
  async function runFixture(env: Record<string, string>): Promise<{ stdout: string; updater: FixtureUpdater | null }> {
    const { stdout } = await promisify(execFile)(process.execPath, ["--require", FIXTURE_STUBS, FIXTURE_INDEX], {
      env: { ...process.env, AUTO_UPDATER_TEST: "1", AUTO_UPDATER_TEST_CONFIG_PATH: "app-update.yml", ...env },
      timeout: 30 * 1000,
    })
    const line = stdout.split(/\r?\n/).find(it => it.startsWith(UPDATER_MARKER))
    return { stdout, updater: line == null ? null : (JSON.parse(line.slice(UPDATER_MARKER.length)) as FixtureUpdater) }
  }

  test("left out, they keep the fixture's own configuration", async ({ expect }) => {
    for (const knobs of [{}, { allowInsecureFeed: false }]) {
      const { stdout, updater } = await runFixture(fixtureEnv(knobs))
      expect(updater, JSON.stringify(knobs)).toEqual(DEFAULT_UPDATER)
      expect(stdout).not.toContain("[updater debug]")
    }
  })

  test("are all in place when the install at launch reads the updater", async ({ expect }) => {
    const { stdout, updater } = await runFixture(
      fixtureEnv({
        crossOriginHeaders: "unset",
        requestHeaders: { "X-Tenant": "acme" },
        authHeader: "Bearer e2e-secret",
        allowInsecureFeed: true,
        publisherName: "CN=EB Test Code Signing",
        authenticodeStub: "accept",
        autoInstallEvent: "manual",
        nextLaunch: true,
        debugLog: true,
      })
    )
    expect(updater).toEqual({
      crossOriginHeaders: null,
      requestHeaders: { "X-Tenant": "acme", authorization: "Bearer e2e-secret" },
      allowInsecureFeed: true,
      publisherName: "CN=EB Test Code Signing",
      autoInstallEvent: "manual",
      authenticodeStub: { response: "success" },
      checkedForUpdates: true,
      waitUntilNextLaunch: true,
    })
    expect(authenticodeStubCalls(stdout)).toEqual([{ publisherNames: ["CN=Stub"] }])
    expect(countOf(stdout, "[updater debug] stub debug line")).toBe(1)
  })

  test("pendingOnly checks for no update and quits after its timeout, with the default autoInstallEvent", async ({ expect }) => {
    const { stdout, updater } = await runFixture(fixtureEnv({ pendingOnly: { quitAfterMs: 1 } }))
    expect(updater).toEqual({ ...DEFAULT_UPDATER, checkedForUpdates: false })
    expect(stdout).toContain("AUTO_INSTALL_ON_NEXT_LAUNCH_TIMEOUT: automatic install did not quit the app\nFIXTURE_QUIT")
  })

  test.for([
    { knob: "AUTO_UPDATER_TEST_CROSS_ORIGIN_HEADERS", value: "none" },
    { knob: "AUTO_UPDATER_TEST_REQUEST_HEADERS", value: "{" },
    { knob: "AUTO_UPDATER_TEST_REQUEST_HEADERS", value: '["X-Tenant"]' },
    { knob: "AUTO_UPDATER_TEST_REQUEST_HEADERS", value: '{"X-Tenant":1}' },
    { knob: "AUTO_UPDATER_TEST_ALLOW_INSECURE_FEED", value: "yes" },
    { knob: "AUTO_UPDATER_TEST_AUTHENTICODE_STUB", value: "reject" },
    { knob: "AUTO_UPDATER_TEST_AUTO_INSTALL_EVENT", value: "never" },
    { knob: "AUTO_UPDATER_TEST_PENDING_ONLY_QUIT_AFTER_MS", value: "15s" },
    { knob: "AUTO_UPDATER_TEST_DEBUG_LOG", value: "false" },
  ])("$knob=$value quits before electron-updater is loaded", async ({ knob, value }, { expect }) => {
    const { stdout, updater } = await runFixture({ [knob]: value })
    expect(stdout).toContain(`INVALID_FIXTURE_KNOB: ${knob} is ${JSON.stringify(value)}, not `)
    expect(stdout).toContain("FIXTURE_QUIT")
    expect(updater).toBeNull()
  })
})

describe("leftoverPartialDownloads", () => {
  test("names the partly written downloads alone, and none without the directory", async ({ expect, tmpDir }) => {
    const pendingDir = await tmpDir.getTempDir({ prefix: "pending" })
    for (const name of ["temp-TestApp.zip", "0-temp-TestApp Setup.exe", "update-info.json", "TestApp Setup.exe"]) {
      await outputFile(path.join(pendingDir, name), "")
    }
    expect((await leftoverPartialDownloads(pendingDir)).sort()).toEqual(["0-temp-TestApp Setup.exe", "temp-TestApp.zip"])
    expect(await leftoverPartialDownloads(path.join(pendingDir, "missing"))).toEqual([])
  })
})

describe("trustSigningIdentityInMachineRoot", () => {
  test.skipIf(process.platform === "win32")("trusts nothing off Windows", async ({ expect, tmpDir }) => {
    // the PKCS#12 is never read off Windows
    expect(await trustSigningIdentityInMachineRoot({ commonName: "EB Test Code Signing", p12Base64: "", password: "" }, tmpDir)).toBeNull()
  })
})
