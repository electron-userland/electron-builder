import { log } from "builder-util"
import { warnAboutGenericFeedQuery } from "app-builder-lib/src/publish/PublishManager"
import type { PublishConfiguration } from "builder-util-runtime"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// The feed-origin rule for the feed query announces itself at build time, since migrate-schema may never have been run.
describe("generic publish url with a query string", () => {
  beforeEach(() => log.resetLimits())
  afterEach(() => vi.restoreAllMocks())

  const generic = (url: string) => ({ provider: "generic", url }) as PublishConfiguration

  test("warns once per feed, naming the query parameters but not their values or the url", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutGenericFeedQuery(generic("https://updates.example.com/app/?token=secret-token-value&tenant=acme-tenant&token=again#frag"))
    // the same feed with another query value (e.g. another platform's token) does not warn again
    warnAboutGenericFeedQuery(generic("https://updates.example.com/app/?token=another-secret"))

    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as unknown as [Record<string, string>, string]
    expect(fields.queryParameters).toBe("token, tenant")
    expect(fields.solution).toContain("crossOriginHeaderAllowlist")
    // the feed query stays on the feed's origin; which headers reach another origin is the app's crossOriginHeaderAllowlist
    expect(message).toContain("electron-updater adds the feed url's query string only to requests on the feed's origin")
    expect(message).toContain("to a request or redirect to another origin only the ones the app's crossOriginHeaderAllowlist allows for it")
    expect(message).toContain("https://www.electron.build/docs/features/auto-update#custom-options-instantiating-updater-directly")
    expect(message).not.toMatch(/electron-updater \d|v\d\d/)
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of ["secret-token-value", "acme-tenant", "another-secret", "updates.example.com"]) {
      expect(logged).not.toContain(secret)
    }
  })

  test("a different feed (e.g. another platform's publish url) warns again", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutGenericFeedQuery(generic("https://updates.example.com/win/?token=win-secret"))
    warnAboutGenericFeedQuery(generic("https://updates.example.com/mac/?key=mac-secret"))
    warnAboutGenericFeedQuery(generic("https://updates.example.com/win/?token=win-secret"))

    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.map(it => (it[0] as unknown as Record<string, string>).queryParameters)).toEqual(["token", "key"])
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of ["win-secret", "mac-secret", "updates.example.com"]) {
      expect(logged).not.toContain(secret)
    }
  })

  test.for([
    { name: "a generic url without a query", config: generic("https://updates.example.com/app/") },
    { name: "a non-generic provider", config: { provider: "github", owner: "o", repo: "r" } as PublishConfiguration },
    { name: "an s3 provider", config: { provider: "s3", bucket: "b" } as PublishConfiguration },
  ])("stays quiet for $name", ({ config }, { expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutGenericFeedQuery(config)

    expect(warn).not.toHaveBeenCalled()
  })
})
