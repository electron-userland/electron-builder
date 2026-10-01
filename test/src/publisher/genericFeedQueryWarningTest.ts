import { log } from "builder-util"
import { resetGenericFeedQueryWarning, warnAboutGenericFeedQuery } from "app-builder-lib/src/publish/PublishManager"
import type { PublishConfiguration } from "builder-util-runtime"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// The v27 feed-origin rule for the feed query announces itself at build time, since migrate-schema may never have been run.
describe("generic publish url with a query string", () => {
  beforeEach(() => resetGenericFeedQueryWarning())
  afterEach(() => vi.restoreAllMocks())

  const generic = (url: string) => ({ provider: "generic", url }) as PublishConfiguration

  test("warns once per process, naming the query parameters but not their values or the url", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    warnAboutGenericFeedQuery(generic("https://updates.example.com/app/?token=secret-token-value&tenant=acme-tenant&token=again#frag"))
    warnAboutGenericFeedQuery(generic("https://updates.example.com/other/?key=another-secret"))

    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0] as unknown as [Record<string, string>, string]
    expect(fields.queryParameters).toBe("token, tenant")
    expect(message).toContain(
      "electron-updater 7 (electron-builder v27) adds it, and sends the credential headers from requestHeaders / addAuthHeader, only to downloads on the feed's origin"
    )
    expect(message).toContain("https://www.electron.build/docs/migration/v27-breaking-changes#update-credentials-stay-on-the-feeds-origin")
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of ["secret-token-value", "acme-tenant", "another-secret", "updates.example.com"]) {
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
