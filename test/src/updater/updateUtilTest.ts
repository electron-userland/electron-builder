import * as semver from "semver"
import { parseXml } from "builder-util-runtime"
import { computeReleaseNotes } from "../../../packages/electron-updater/src/providers/GitHubProvider"
import { expect } from "vitest"

describe("GitHub Provider", () => {
  describe("computeReleaseNotes", () => {
    it("returns single release notes string when full changelog is false", () => {
      const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.1"/>
          <content>Release 1.0.1 notes</content>
        </entry>
      </feed>
    `)
      const latest = feed.element("entry")
      const result = computeReleaseNotes(semver.parse("1.0.0")!, false, feed, latest)
      expect(result).toEqual("Release 1.0.1 notes")
    })

    it('treats "No content." as empty string when full changelog is false', () => {
      const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.2"/>
          <content>No content.</content>
        </entry>
      </feed>
    `)
      const latest = feed.element("entry")
      const result = computeReleaseNotes(semver.parse("1.0.0")!, false, feed, latest)
      expect(result).toEqual("")
    })

    it("returns an array of release notes between currentVersion (exclusive) and latestVersion (inclusive), sorted desc", () => {
      const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.3.0"/>
          <content>Notes v1.3.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>Notes 1.2.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/0.9.0"/>
          <content>Notes 0.9.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/docs-update"/>
          <content>Docs</content>
        </entry>
      </feed>
    `)
      const entries = feed.getElements("entry")
      const latest = entries[0] // v1.3.0
      const result = computeReleaseNotes(semver.parse("1.0.0")!, true, feed, latest)
      expect(result).deep.equal([
        { version: "v1.3.0", note: "Notes v1.3.0" },
        { version: "1.2.0", note: "Notes 1.2.0" },
      ])
    })

    it("returns null when latest release tag cannot be parsed to a version", () => {
      const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/not-a-version"/>
          <content>Latest with invalid tag</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.5.0"/>
          <content>Should be ignored</content>
        </entry>
      </feed>
    `)
      const latest = feed.element("entry")
      const result = computeReleaseNotes(semver.parse("1.0.0")!, true, feed, latest)
      expect(result).toEqual(null)
    })
  })

  it("handles missing <content> element when full changelog is false", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.1"/>
        </entry>
      </feed>
    `)
    const latest = feed.element("entry")
    const result = computeReleaseNotes(semver.parse("1.0.0")!, false, feed, latest)
    expect(result).toEqual("")
  })

  it("includes prerelease entries when they are > currentVersion and <= latestVersion", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.2.0"/>
          <content>Release v1.2.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0-beta.2"/>
          <content>Beta notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.1.0"/>
          <content>1.1.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = feed.getElements("entry")[0]
    const result = computeReleaseNotes(semver.parse("1.0.0")!, true, feed, latest) as any[]
    expect(result).deep.equal([
      { version: "v1.2.0", note: "Release v1.2.0" },
      { version: "1.2.0-beta.2", note: "Beta notes" },
      { version: "1.1.0", note: "1.1.0 notes" },
    ])
  })

  it("excludes versions that are <= currentVersion", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>1.2.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.1.5"/>
          <content>1.1.5</content>
        </entry>
      </feed>
    `)
    const latest = feed.element("entry")
    const result = computeReleaseNotes(semver.parse("1.2.0")!, true, feed, latest)
    expect(result).toEqual([])
  })

  it("supports tags with build metadata and sorts results correctly", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.3.0+build.1"/>
          <content>1.3.0 build</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.5+exp.sha.5114f85"/>
          <content>1.2.5 exp</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.3.0"/>
          <content>latest</content>
        </entry>
      </feed>
    `)
    const latest = feed.getElements("entry")[2]
    const result = computeReleaseNotes(semver.parse("1.2.0")!, true, feed, latest) as any[]
    expect(result).deep.equal([
      { version: "v1.3.0+build.1", note: "1.3.0 build" },
      { version: "1.3.0", note: "latest" },
      { version: "1.2.5+exp.sha.5114f85", note: "1.2.5 exp" },
    ])
  })

  it("ignores entries whose link does not contain /tag/ (regex mismatch)", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/1.4.0"/>
          <content>Bad link</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.4.0"/>
          <content>Good</content>
        </entry>
      </feed>
    `)
    const latest = feed.getElements("entry")[1]
    const result = computeReleaseNotes(semver.parse("1.3.0")!, true, feed, latest) as any[]
    expect(result).deep.equal([{ version: "1.4.0", note: "Good" }])
  })

  it("includes entry that is equal to latestVersion (latest included)", () => {
    const feed = parseXml(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.0.0"/>
          <content>Latest notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.9.0"/>
          <content>1.9.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = feed.element("entry")
    const result = computeReleaseNotes(semver.parse("1.8.0")!, true, feed, latest) as any[]
    expect(result).deep.equal([
      { version: "2.0.0", note: "Latest notes" },
      { version: "1.9.0", note: "1.9.0 notes" },
    ])
  })
})

