import { log } from "builder-util"
import { warnAboutInsecureFeed } from "app-builder-lib/src/publish/PublishManager"
import type { PublishConfiguration } from "builder-util-runtime"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// electron-updater 7 rejects a plain http feed that is not loopback: the build announces it, since the app may never be run before shipping.
describe("plain http feed url in app-update.yml", () => {
  beforeEach(() => log.resetLimits())
  afterEach(() => vi.restoreAllMocks())

  const config = (provider: string, url: string) => ({ provider, url }) as PublishConfiguration

  test("warns once per feed origin, naming the origin but not the path, query or user info", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutInsecureFeed(config("generic", "http://user:secret-password@updates.example.com:8080/win/?token=secret-token"))
    // another path on the same origin (e.g. another platform's feed) does not warn again
    warnAboutInsecureFeed(config("generic", "http://updates.example.com:8080/mac/"))

    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as unknown as [Record<string, string>, string]
    expect(fields.feed).toBe("http://updates.example.com:8080")
    expect(message).toContain("electron-updater 7 (electron-builder v27) rejects every update request over http to a host that is not loopback")
    expect(message).toContain("autoUpdater.allowInsecureFeed = true")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https")
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of ["secret-password", "secret-token", "/win/", "user:"]) {
      expect(logged).not.toContain(secret)
    }
  })

  test("a custom provider url warns, and another origin warns again", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutInsecureFeed(config("custom", "http://updates.example.com/app/"))
    warnAboutInsecureFeed(config("generic", "http://mirror.example.net/app/"))

    expect(warn.mock.calls.map(it => (it[0] as unknown as Record<string, string>).feed)).toEqual(["http://updates.example.com", "http://mirror.example.net"])
  })

  test.for([
    { name: "a github protocol http", config: { provider: "github", owner: "o", repo: "r", protocol: "http" } as PublishConfiguration, feed: "http://github.com" },
    {
      name: "a github enterprise host over http",
      config: { provider: "github", owner: "o", repo: "r", host: "ghe.example.com:8080", protocol: "http" } as PublishConfiguration,
      feed: "http://ghe.example.com:8080",
    },
    {
      name: "an s3 endpoint over http",
      config: { provider: "s3", bucket: "b", endpoint: "http://minio.example.com:9000" } as PublishConfiguration,
      feed: "http://minio.example.com:9000",
    },
  ])("warns for $name, naming its origin", ({ config, feed }, { expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutInsecureFeed(config)
    // once per feed origin
    warnAboutInsecureFeed(config)

    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as unknown as [Record<string, string>, string]
    expect(fields.feed).toBe(feed)
    expect(message).toContain("electron-updater 7 (electron-builder v27) rejects every update request over http to a host that is not loopback")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https")
  })

  test.for([
    { name: "an https url", config: config("generic", "https://updates.example.com/app/") },
    { name: "a localhost url", config: config("generic", "http://localhost:8080/app/") },
    { name: "a 127.0.0.0/8 url", config: config("generic", "http://127.0.0.2/app/") },
    { name: "an ::1 url", config: config("generic", "http://[::1]:8080/app/") },
    { name: "a url that is not absolute", config: config("generic", "updates/app/") },
    { name: "a provider without a url", config: { provider: "github", owner: "o", repo: "r" } as PublishConfiguration },
    { name: "an http url of another provider", config: config("keygen", "http://updates.example.com/app/") },
    { name: "a github protocol https", config: { provider: "github", owner: "o", repo: "r", protocol: "https" } as PublishConfiguration },
    { name: "a github loopback host over http", config: { provider: "github", owner: "o", repo: "r", host: "localhost:8080", protocol: "http" } as PublishConfiguration },
    { name: "an s3 bucket without an endpoint", config: { provider: "s3", bucket: "b" } as PublishConfiguration },
    { name: "an s3 endpoint over https", config: { provider: "s3", bucket: "b", endpoint: "https://minio.example.com" } as PublishConfiguration },
    { name: "an s3 loopback endpoint over http", config: { provider: "s3", bucket: "b", endpoint: "http://127.0.0.1:9000" } as PublishConfiguration },
    { name: "an s3 http endpoint with accelerate", config: { provider: "s3", bucket: "b", endpoint: "http://minio.example.com", accelerate: true } as PublishConfiguration },
  ])("stays quiet for $name", ({ config }, { expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutInsecureFeed(config)

    expect(warn).not.toHaveBeenCalled()
  })
})
