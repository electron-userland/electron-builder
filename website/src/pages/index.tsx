import type { ReactNode } from "react"
import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Layout from "@theme/Layout"
import HomepageFeatures from "@site/src/components/HomepageFeatures"
import styles from "./index.module.css"

function HeroBanner(): ReactNode {
  const { siteConfig } = useDocusaurusContext()
  return (
    <div className={styles.heroBanner}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>{siteConfig.title}</h1>
            <p className={styles.heroTagline}>{siteConfig.tagline}</p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/docs">
                Get Started
              </Link>
              <Link
                className="button button--secondary button--lg"
                href="https://github.com/electron-userland/electron-builder"
              >
                GitHub
              </Link>
            </div>
          </div>
          <div className={styles.heroIllustration} aria-hidden="true">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={styles.heroSvg}>
              <circle cx="100" cy="100" r="80" fill="var(--ifm-color-primary)" opacity="0.15" />
              <circle cx="100" cy="100" r="55" fill="var(--ifm-color-primary)" opacity="0.25" />
              <path
                d="M70 80 L100 60 L130 80 L130 120 L100 140 L70 120 Z"
                fill="var(--ifm-color-primary)"
                opacity="0.8"
              />
              <path d="M85 95 L100 85 L115 95 L115 115 L100 125 L85 115 Z" fill="white" opacity="0.9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home(): ReactNode {
  return (
    <Layout description="A complete solution to package and build a ready-for-distribution Electron app with auto-updating support.">
      <HeroBanner />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  )
}
