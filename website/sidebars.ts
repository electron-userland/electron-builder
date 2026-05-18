import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "doc", id: "introduction", label: "Overview" },
    { type: "doc", id: "cli", label: "CLI" },
    { type: "doc", id: "targets", label: "Targets" },

    {
      type: "category",
      label: "Programmatic API",
      items: [
        { type: "doc", id: "programmatic-usage", label: "Programmatic Usage" },
        { type: "doc", id: "api/index", label: "API Reference" },
      ],
    },

    {
      type: "category",
      label: "Reference",
      items: [{ type: "doc", id: "glossary", label: "Glossary" }],
    },

    { type: "doc", id: "donate", label: "Donate" },
  ],

  configSidebar: [
    { type: "doc", id: "configuration", label: "Overview" },
    { type: "doc", id: "contents", label: "Contents" },
    { type: "doc", id: "file-patterns", label: "File Patterns" },
    { type: "doc", id: "architecture", label: "Build Architectures" },
    { type: "doc", id: "publish", label: "Publish" },
  ],

  macosSidebar: [
    { type: "doc", id: "mac", label: "macOS" },
    { type: "doc", id: "dmg", label: "DMG" },
    { type: "doc", id: "mas", label: "Mac App Store" },
    { type: "doc", id: "pkg", label: "PKG" },
  ],

  windowsSidebar: [
    { type: "doc", id: "win", label: "Windows" },
    { type: "doc", id: "nsis", label: "NSIS" },
    { type: "doc", id: "appx", label: "AppX" },
    { type: "doc", id: "msi", label: "MSI" },
    { type: "doc", id: "msi-wrapped", label: "MSI Wrapped" },
    { type: "doc", id: "squirrel-windows", label: "Squirrel Windows" },
  ],

  linuxSidebar: [
    { type: "doc", id: "linux", label: "Linux" },
    { type: "doc", id: "appimage", label: "AppImage" },
    { type: "doc", id: "flatpak", label: "Flatpak" },
    { type: "doc", id: "snap", label: "Snap" },
  ],
}

export default sidebars
