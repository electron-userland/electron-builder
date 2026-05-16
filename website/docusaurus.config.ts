import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import remarkInclude from "./src/remark/remark-include.mjs"

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

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "docusaurus-plugin-typedoc",
      {
        entryPoints: ["../packages/*"],
        entryPointStrategy: "packages",
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
        preserveAnchorCasing: true,
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
          routeBasePath: "/",
          remarkPlugins: [[remarkInclude, { docsDir }]],
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
            { label: "Introduction", to: "/" },
            { label: "CLI", to: "/cli" },
            { label: "Configuration", to: "/configuration" },
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
