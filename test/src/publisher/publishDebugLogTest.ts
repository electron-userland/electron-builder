import { log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import type { ArtifactCreated, Packager } from "app-builder-lib"
import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { createRequire } from "module"
import * as path from "path"
import { afterEach, describe, test, vi } from "vitest"

interface DebugModule {
  log: (...args: Array<unknown>) => void
  enable: (namespaces: string) => void
  disable: () => string
}

// the debug module app-builder-lib itself loads
const appBuilderDebug = createRequire(path.join(__dirname, "..", "..", "..", "packages", "app-builder-lib", "package.json"))("debug") as DebugModule

/** What `DEBUG=electron-builder:publish` prints while `run` runs. */
async function publishDebugOutput(run: () => Promise<void>): Promise<string> {
  const lines: Array<string> = []
  const previousLog = appBuilderDebug.log
  const previousNamespaces = appBuilderDebug.disable()
  appBuilderDebug.log = (...args: Array<unknown>) => lines.push(args.map(String).join(" "))
  appBuilderDebug.enable("electron-builder:publish")
  try {
    await run()
  } finally {
    appBuilderDebug.log = previousLog
    appBuilderDebug.enable(previousNamespaces)
  }
  return lines.join("\n")
}

describe("the electron-builder:publish debug log", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  test("masks the URL credentials of the publish configurations and of the artifact events", async ({ expect }) => {
    // publish even when the test runs for a pull request (which logs a warning)
    vi.stubEnv("PUBLISH_FOR_PULL_REQUEST", "true")
    vi.spyOn(log, "warn").mockImplementation(() => undefined)

    const publishConfig = { provider: "generic", url: "https://feed-user:FEED_PASSWORD_SECRET@example.com/updates?token=FEED_TOKEN_SECRET" }
    const artifactCreatedHandlers: Array<(event: ArtifactCreated) => Promise<void>> = []
    const packager = {
      cancellationToken: new CancellationToken(),
      config: { detectUpdateChannel: false, publish: [publishConfig] },
      onTargetsCreated: () => undefined,
      onAfterPack: () => undefined,
      onArtifactCreated: (handler: (event: ArtifactCreated) => Promise<void>) => artifactCreatedHandlers.push(handler),
    }
    const publishManager = new PublishManager(packager as unknown as Packager, { publish: "always" })
    // a platform without publish configs of its own
    const platformPackager = { platformOptions: { publish: null } }
    const events = [
      // an artifact with a publish config of its own (a generic one is not uploaded)
      { packager: platformPackager, target: null, arch: null, file: "app.zip", publishConfig },
      // an artifact without one, whose target options hold a URL
      {
        packager: platformPackager,
        target: { name: "nsis-web", options: { appPackageUrl: "https://web-user:WEB_PASSWORD_SECRET@example.com/packages?sig=SIGNATURE_SECRET" } },
        arch: null,
        file: "setup.exe",
      },
    ] as unknown as Array<ArtifactCreated>

    const output = await publishDebugOutput(async () => {
      await publishManager.getGlobalPublishConfigurations()
      for (const event of events) {
        for (const handler of artifactCreatedHandlers) {
          await handler(event)
        }
      }
      await publishManager.awaitTasks()
    })

    expect(output).toContain("Explicit publish provider")
    expect(output).toContain("artifactCreated (isPublish: true)")
    expect(output).toContain("publishConfig:")
    expect(output).toContain("publishConfigs: null")
    expect(output).toContain("https://<redacted>@example.com/updates?token=<redacted>")
    expect(output).toContain("https://<redacted>@example.com/packages?sig=<redacted>")
    expect(output).not.toMatch(/SECRET/)
  })
})
