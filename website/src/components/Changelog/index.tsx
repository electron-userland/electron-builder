import type { ReactNode } from "react"
import Link from "@docusaurus/Link"
import Heading from "@theme/Heading"
import Layout from "@theme/Layout"
import { BUMPS, type Bump, type ChangelogData, type Entry } from "@site/src/changelog/model"
import styles from "./styles.module.css"

// The /changelog route of website/scripts/docusaurus-plugin-changelog.ts: every release.

const TITLES: Record<Bump, string> = { major: "Major changes", minor: "Minor changes", patch: "Patch changes" }

function EntryItem({ repo, entry }: { repo: string; entry: Entry }): ReactNode {
  const { updated } = entry
  return (
    <li className={styles.entry}>
      <span dangerouslySetInnerHTML={{ __html: entry.summary }} />
      <div className={styles.meta} data-pagefind-ignore="">
        {entry.packages.map(pkg => (
          <code key={pkg}>{pkg}</code>
        ))}
        {entry.pr !== undefined && <Link href={`${repo}/pull/${entry.pr}`}>#{entry.pr}</Link>}
        <Link href={`${repo}/commit/${entry.commit}`}>
          <code>{entry.commit.slice(0, 7)}</code>
        </Link>
        {updated !== undefined && (
          <span>
            updated
            {updated.pr !== undefined && (
              <>
                {" in "}
                <Link href={`${repo}/pull/${updated.pr}`}>#{updated.pr}</Link>
              </>
            )}
            {updated.commit !== undefined && (
              <>
                {" in "}
                <Link href={`${repo}/commit/${updated.commit}`}>
                  <code>{updated.commit}</code>
                </Link>
              </>
            )}
          </span>
        )}
      </div>
      {entry.body !== undefined && (
        <details className={styles.details} data-pagefind-ignore="">
          <summary>Details</summary>
          <div className="markdown" dangerouslySetInnerHTML={{ __html: entry.body }} />
        </details>
      )}
    </li>
  )
}

function Releases({ changelog }: { changelog: ChangelogData }): ReactNode {
  return changelog.releases.map(release => (
    <section key={release.id} className={styles.release}>
      <Heading as="h2" id={release.pkg === "electron-builder" ? `v${release.version}` : release.id}>
        {release.id} <small className={styles.date}>{release.date}</small>
      </Heading>
      {release.from !== undefined && (
        <div className={styles.meta} data-pagefind-ignore="">
          <Link href={`${changelog.repo}/compare/${release.from}...${release.tag}`}>Compare on GitHub</Link>
        </div>
      )}
      {release.sections.map(section => (
        <div key={section.pkg}>
          <h3>
            {section.pkg} {section.version}
          </h3>
          {section.dependencies !== undefined && (
            <p>
              Updated dependencies:{" "}
              {section.dependencies.map((dependency, i) => (
                <span key={dependency}>
                  {i > 0 && ", "}
                  <code>{dependency}</code>
                </span>
              ))}
            </p>
          )}
          {BUMPS.map(bump => {
            const entries = section.entries.filter(entry => entry.bump === bump)
            return entries.length === 0 ? null : (
              <div key={bump}>
                <h4>{TITLES[bump]}</h4>
                <ul className={styles.entries}>
                  {entries.map(entry => (
                    <EntryItem key={entry.key} repo={changelog.repo} entry={entry} />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  ))
}

export default function Changelog({ changelog }: { changelog: ChangelogData }): ReactNode {
  const builder = changelog.releases.filter(release => release.pkg === "electron-builder")
  return (
    <Layout title="Changelog" description="The releases of electron-builder and electron-updater.">
      <main className="container margin-vert--lg">
        <Heading as="h1">Changelog</Heading>
        <p>
          The releases of electron-builder and electron-updater since {builder[builder.length - 1].version}. Older releases are in{" "}
          <Link href={`${changelog.repo}/blob/master/CHANGELOG.md`}>CHANGELOG.md on GitHub</Link>.
        </p>
        <Releases changelog={changelog} />
      </main>
    </Layout>
  )
}
