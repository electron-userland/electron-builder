---
title: "Electron Forge Integration"
---

electron-builder ships four [Electron Forge](https://www.electronforge.io/) maker packages that let you produce electron-builder targets from a Forge project without migrating your entire build pipeline.

:::tip[Consider using electron-builder directly]
[Publishing](../publish.md), [Auto Update](./auto-update.md), and [Code Signing](./code-signing/code-signing.md) are only available when using electron-builder as your primary build tool. If you need any of those features, migrate fully to electron-builder rather than using these makers.
:::

## How it works

Each maker is a thin wrapper around `buildForge()` from `app-builder-lib`. When Electron Forge calls `make`, the maker delegates to electron-builder's full packaging pipeline for that target, then returns the paths to the produced artifacts. All electron-builder configuration options for the target are available via the maker's `config` key.

## Available makers

| Package | Target | Platform |
|---|---|---|
| `electron-forge-maker-nsis` | NSIS installer (`.exe`) | Windows |
| `electron-forge-maker-nsis-web` | Web installer (`.exe`, downloads payload at install time) | Windows |
| `electron-forge-maker-appimage` | AppImage (`.AppImage`) | Linux |
| `electron-forge-maker-snap` | Snap package (`.snap`) | Linux |

---

## NSIS installer

```bash
npm install --save-dev electron-forge-maker-nsis
```

```js title="forge.config.js"
const { MakerNsis } = require("electron-forge-maker-nsis")

module.exports = {
  makers: [
    new MakerNsis({
      // All NsisOptions are accepted here — see /docs/nsis for the full reference
      oneClick: false,
      perMachine: true,
    }),
  ],
}
```

Full configuration reference: [NSIS](../nsis.md)

---

## NSIS web installer

```bash
npm install --save-dev electron-forge-maker-nsis-web
```

```js title="forge.config.js"
const { MakerNsisWeb } = require("electron-forge-maker-nsis-web")

module.exports = {
  makers: [
    new MakerNsisWeb({
      // NsisWebOptions — extends NsisOptions
    }),
  ],
}
```

The web installer produces a small stub executable that detects the user's architecture and downloads the appropriate payload from your publish provider at install time. Full configuration reference: [NSIS](../nsis.md)

---

## AppImage

```bash
npm install --save-dev electron-forge-maker-appimage
```

```js title="forge.config.js"
const { MakerAppImage } = require("electron-forge-maker-appimage")

module.exports = {
  makers: [
    new MakerAppImage({
      // AppImageOptions — see /docs/appimage for the full reference
      license: "LICENSE",
    }),
  ],
}
```

Full configuration reference: [AppImage](../appimage.md)

---

## Snap

```bash
npm install --save-dev electron-forge-maker-snap
```

```js title="forge.config.js"
const { MakerSnap } = require("electron-forge-maker-snap")

module.exports = {
  makers: [
    new MakerSnap({
      // SnapOptions — see /docs/snap for the full reference
      confinement: "strict",
      grade: "stable",
    }),
  ],
}
```

Full configuration reference: [Snap](../snap.md)

---

## Limitations

These makers delegate to electron-builder's packaging only. The following electron-builder features are **not available** through Forge makers:

- **Publishing** — use `electron-builder --publish` directly
- **Auto Update** — requires electron-builder's full publish pipeline; see [Auto Update](./auto-update.md)
- **Code Signing** — requires electron-builder's signing configuration; see [Code Signing](./code-signing/code-signing.md)

For projects that need any of these, the recommended path is to use electron-builder as the primary build tool instead of Electron Forge.
