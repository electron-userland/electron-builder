import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import remarkInclude from "./src/remark/remark-include.mjs"
import remarkFixAnchors from "./src/remark/remark-fix-anchors.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = join(__dirname, "docs")

const config: Config = {
  title: "electron-builder",
  tagline: "A complete solution to package and build a ready-for-distribution Electron app",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://www.electron.build",
  baseUrl: "/",

  organizationName: "electron-userland",
  projectName: "electron-builder",

  onBrokenLinks: "warn",

  markdown: {
    format: "detect",
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        createRedirects(toPath: string) {
          if (toPath.startsWith("/docs/") && toPath !== "/docs/") {
            return [toPath.replace("/docs/", "/")]
          }
        },
      },
    ],
    [
      "docusaurus-plugin-typedoc",
      {
        entryPoints: ["../packages/*"],
        entryPointStrategy: "packages",
        tsconfig: "../tsconfig-base.json",
        out: "./docs/api",
        excludeExternals: true,
        excludePrivate: true,
        excludeProtected: true,
        excludeNotDocumented: false,
        includeVersion: true,
        disableSources: true,
        cleanOutputDir: false,
        flattenOutputFiles: true,
        hideGroupHeadings: true,
        hidePageTitle: true,
        hidePageHeader: true,
        useHTMLEncodedBrackets: true,
        preserveAnchorCasing: false,
        visibilityFilters: {
          protected: false,
          private: false,
          inherited: false,
          external: false,
        },
        tableColumnSettings: {
          hideDefaults: false,
          hideInherited: false,
          hideModifiers: true,
          hideOverrides: true,
          hideSources: true,
          hideValues: false,
          leftAlignHeaders: false,
        },
        validation: {
          notExported: false,
          invalidLink: false,
        },
      },
    ],
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/electron-userland/electron-builder/edit/master/website/",
          routeBasePath: "/docs",
          remarkPlugins: [[remarkInclude, { docsDir }], remarkFixAnchors],
          exclude: ["api/!(index).md"],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "electron-builder",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          type: "dropdown",
          label: "Features",
          position: "left",
          items: [
            { type: "doc", docId: "hooks", label: "Hooks" },
            { type: "doc", docId: "icons", label: "Icons" },
            { type: "doc", docId: "auto-update", label: "Auto Update" },
            { type: "doc", docId: "code-signing", label: "Code Signing" },
            { type: "doc", docId: "multi-platform-build", label: "Multi Platform Build" },
            { type: "doc", docId: "github-actions", label: "GitHub Actions" },
            { type: "doc", docId: "troubleshooting", label: "Troubleshooting" },
          ],
        },
        {
          type: "dropdown",
          label: "Tutorials",
          position: "left",
          items: [
            { type: "doc", docId: "tutorials/adding-electron-fuses", label: "Adding Electron Fuses" },
            { type: "doc", docId: "tutorials/loading-app-dependencies-manually", label: "Loading App Dependencies Manually" },
            { type: "doc", docId: "tutorials/two-package-structure", label: "Two Package Structure" },
            { type: "doc", docId: "tutorials/macos-kernel-extensions", label: "macOS Kernel Extensions" },
            { type: "doc", docId: "tutorials/code-signing-windows-apps-on-unix", label: "Code Signing on Unix" },
            { type: "doc", docId: "tutorials/release-using-channels", label: "Release Using Channels" },
            { type: "doc", docId: "tutorials/test-update-on-s3-locally", label: "Test Update on S3 Locally" },
          ],
        },
        {
          href: "https://github.com/electron-userland/electron-builder",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Introduction", to: "/docs" },
            { label: "CLI", to: "/docs/cli" },
            { label: "Configuration", to: "/docs/configuration" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub Issues", href: "https://github.com/electron-userland/electron-builder/issues" },
            { label: "npm", href: "https://www.npmjs.com/package/electron-builder" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} electron-builder contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
