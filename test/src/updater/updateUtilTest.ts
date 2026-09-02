import * as semver from "semver"
import { parseXml, XElement } from "builder-util-runtime"
import { computeReleaseNotes } from "electron-updater/src/providers/GitHubProvider"
import { expect } from "vitest"

function parseReleaseFeed(xmlFeed: string): XElement[] {
  return parseXml(xmlFeed).getElements("entry")
}

describe("GitHub Provider", () => {
  describe("computeReleaseNotes", () => {
    it("returns single release notes string when full changelog is false", () => {
      const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.1"/>
          <content>Release 1.0.1 notes</content>
        </entry>
      </feed>
    `)
      const latest = releaseEntries[0]
      const result = computeReleaseNotes(semver.parse("1.0.0")!, false, releaseEntries, latest)
      expect(result).toEqual("Release 1.0.1 notes")
    })

    it('treats "No content." as empty string when full changelog is false', () => {
      const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.2"/>
          <content>No content.</content>
        </entry>
      </feed>
    `)
      const latest = releaseEntries[0]
      const result = computeReleaseNotes(semver.parse("1.0.0")!, false, releaseEntries, latest)
      expect(result).toEqual("")
    })

    it("returns an array of release notes between currentVersion (exclusive) and latestVersion (inclusive), sorted desc", () => {
      const releaseEntries = parseReleaseFeed(`
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
      const latest = releaseEntries[0] // v1.3.0
      const result = computeReleaseNotes(semver.parse("1.0.0")!, true, releaseEntries, latest)
      expect(result).deep.equal([
        { version: "1.3.0", note: "Notes v1.3.0" },
        { version: "1.2.0", note: "Notes 1.2.0" },
      ])
    })

    it("returns null when latest release tag cannot be parsed to a version", () => {
      const releaseEntries = parseReleaseFeed(`
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
      const latest = releaseEntries[0]
      const result = computeReleaseNotes(semver.parse("1.0.0")!, true, releaseEntries, latest)
      expect(result).toEqual(null)
    })
  })

  it("handles missing <content> element when full changelog is false", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.0.1"/>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.0.0")!, false, releaseEntries, latest)
    expect(result).toEqual("")
  })

  it("includes prerelease entries when they are > currentVersion and <= latestVersion", () => {
    const releaseEntries = parseReleaseFeed(`
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
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.0.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.2.0", note: "Release v1.2.0" },
      { version: "1.2.0-beta.2", note: "Beta notes" },
      { version: "1.1.0", note: "1.1.0 notes" },
    ])
  })

  it("excludes versions that are <= currentVersion", () => {
    const releaseEntries = parseReleaseFeed(`
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
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.2.0")!, true, releaseEntries, latest)
    expect(result).toEqual([])
  })

  it("supports tags with build metadata and sorts results correctly", () => {
    const releaseEntries = parseReleaseFeed(`
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
    const latest = releaseEntries[2]
    const result = computeReleaseNotes(semver.parse("1.2.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.3.0+build.1", note: "1.3.0 build" },
      { version: "1.3.0", note: "latest" },
      { version: "1.2.5+exp.sha.5114f85", note: "1.2.5 exp" },
    ])
  })

  it("ignores entries whose link does not contain /tag/ (regex mismatch)", () => {
    const releaseEntries = parseReleaseFeed(`
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
    const latest = releaseEntries[1]
    const result = computeReleaseNotes(semver.parse("1.3.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([{ version: "1.4.0", note: "Good" }])
  })

  it("includes entry that is equal to latestVersion (latest included)", () => {
    const releaseEntries = parseReleaseFeed(`
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
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.8.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "2.0.0", note: "Latest notes" },
      { version: "1.9.0", note: "1.9.0 notes" },
    ])
  })

  // regression test for issue #9570: entries with versions ABOVE latestVersion must be excluded
  it("excludes entries with versions above latestVersion (core regression for #9570)", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.3.0"/>
          <content>2.3.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.2.0"/>
          <content>2.2.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.1.0"/>
          <content>2.1.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.0.0"/>
          <content>2.0.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[1] // 2.2.0 is latest — 2.3.0 exists but should not appear
    const result = computeReleaseNotes(semver.parse("2.0.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "2.2.0", note: "2.2.0 notes" },
      { version: "2.1.0", note: "2.1.0 notes" },
    ])
  })

  it("returns empty array when latestVersion equals currentVersion", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>1.2.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.2.0")!, true, releaseEntries, latest)
    expect(result).deep.equal([])
  })

  it("returns empty array when latestVersion is older than currentVersion", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.5.0"/>
          <content>1.5.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.4.0"/>
          <content>1.4.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // 1.5.0 is latest, but currentVersion is 2.0.0
    const result = computeReleaseNotes(semver.parse("2.0.0")!, true, releaseEntries, latest)
    expect(result).deep.equal([])
  })

  it("excludes the entry exactly at currentVersion (uses gt, not gte)", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>1.2.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.1.0"/>
          <content>1.1.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // 1.2.0
    const result = computeReleaseNotes(semver.parse("1.1.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([{ version: "1.2.0", note: "1.2.0 notes" }])
  })

  it("skips non-semver entries interspersed between valid versions", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v2.0.0"/>
          <content>2.0.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/docs-update-3"/>
          <content>Docs update</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.9.0"/>
          <content>1.9.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/website-v3"/>
          <content>Website update</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.8.0"/>
          <content>1.8.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // v2.0.0
    const result = computeReleaseNotes(semver.parse("1.7.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "2.0.0", note: "2.0.0 notes" },
      { version: "1.9.0", note: "1.9.0 notes" },
      { version: "1.8.0", note: "1.8.0 notes" },
    ])
  })

  it("returns the single latestRelease entry when it is the only one above currentVersion", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.5.0"/>
          <content>1.5.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.4.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([{ version: "1.5.0", note: "1.5.0 notes" }])
  })

  it("handles a prerelease as the latestRelease, excluding versions not in range", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.2.0-beta.2"/>
          <content>beta.2 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.2.0-beta.1"/>
          <content>beta.1 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.1.0"/>
          <content>1.1.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // v1.2.0-beta.2
    const result = computeReleaseNotes(semver.parse("1.1.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.2.0-beta.2", note: "beta.2 notes" },
      { version: "1.2.0-beta.1", note: "beta.1 notes" },
    ])
  })

  it("strips v prefix from versions in the result regardless of tag URL format", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v2.0.0"/>
          <content>v2.0.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/v1.9.0"/>
          <content>v1.9.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // v2.0.0
    const result = computeReleaseNotes(semver.parse("1.8.0")!, true, releaseEntries, latest) as any[]
    expect(result[0].version).toBe("2.0.0")
    expect(result[1].version).toBe("1.9.0")
  })

  it("includes both occurrences when the same version appears twice in the feed", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>first 1.2.0</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>second 1.2.0</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.1.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.2.0", note: "first 1.2.0" },
      { version: "1.2.0", note: "second 1.2.0" },
    ])
  })

  it("converts No content. to empty string in the full changelog array", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.3.0"/>
          <content>No content.</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>Real notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0] // 1.3.0
    const result = computeReleaseNotes(semver.parse("1.1.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.3.0", note: "" },
      { version: "1.2.0", note: "Real notes" },
    ])
  })

  it("returns descending order even when feed entries are in ascending order", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.1.0"/>
          <content>1.1.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.2.0"/>
          <content>1.2.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/1.3.0"/>
          <content>1.3.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[2] // 1.3.0
    const result = computeReleaseNotes(semver.parse("1.0.0")!, true, releaseEntries, latest) as any[]
    expect(result).deep.equal([
      { version: "1.3.0", note: "1.3.0 notes" },
      { version: "1.2.0", note: "1.2.0 notes" },
      { version: "1.1.0", note: "1.1.0 notes" },
    ])
  })

  it("returns null when latestRelease link is missing the /tag/ segment", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/1.0.1"/>
          <content>notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[0]
    const result = computeReleaseNotes(semver.parse("1.0.0")!, true, releaseEntries, latest)
    expect(result).toBeNull()
  })

  it("returns empty array when all feed entries are either above latestVersion or equal to currentVersion", () => {
    const releaseEntries = parseReleaseFeed(`
      <feed>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/3.0.0"/>
          <content>3.0.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.5.0"/>
          <content>2.5.0 notes</content>
        </entry>
        <entry>
          <link href="https://github.com/owner/repo/releases/tag/2.0.0"/>
          <content>2.0.0 notes</content>
        </entry>
      </feed>
    `)
    const latest = releaseEntries[2] // 2.0.0 is latest; 3.0.0 and 2.5.0 are above it
    // currentVersion = 2.0.0 → 3.0.0 and 2.5.0 fail lte(latest) check; 2.0.0 fails gt(current) check
    const result = computeReleaseNotes(semver.parse("2.0.0")!, true, releaseEntries, latest)
    expect(result).deep.equal([])
  })
})
