The top-level [`snapcraft`](#configuration) key is the recommended way to configure [Snap](https://snapcraft.io) builds. It requires an explicit `base` field and separates per-core options cleanly.

The legacy [`snap`](#legacy-snap-key) key is **deprecated** — it is still supported for `core22` and older but will not receive new features. See [Migrating from `snap` to `snapcraft`](#migrating-from-snap-to-snapcraft) if you are on the old key.

---

## Core 24 (Recommended)

> **Beta** — core24 support is new. Please report any issues.

`core24` targets Ubuntu 24.04 Noble and requires **Electron 25.0.0+** (28.0.0+ recommended). It uses snapcraft v8 (craft-application framework) and brings first-class Wayland, the GNOME extension, and Launchpad remote builds for multi-arch CI.

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "confinement": "strict"
    }
  }
}
```

### Build Environments

Choose one build environment. They are mutually exclusive.

| Option | Platform | Recommended for |
|---|---|---|
| `useLXD: true` | Linux | Linux CI where nested virtualisation is unavailable |
| `useMultipass: true` | macOS / Windows / Linux | Local development |
| `useDestructiveMode: true` | Linux only | Docker CI containers without any virtualisation |
| `remoteBuild.enabled: true` | Any | Multi-arch CI (amd64, arm64, armhf) via Launchpad |

If none is set and you are on Linux, snapcraft's own default (Multipass) is used. On non-Linux platforms you must choose `useMultipass` or `remoteBuild`.

#### LXD

Container-based isolation. Preferred on most Linux CI systems because it does not require nested virtualisation (unlike Multipass).

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "useLXD": true
    }
  }
}
```

LXD must be installed and the build user must be in the `lxd` group:

```sh
sudo snap install lxd
sudo usermod -aG lxd $USER
lxd init --minimal
```

#### Multipass

VM-based isolation. The default choice for local development on macOS and Windows.

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "useMultipass": true
    }
  }
}
```

#### Destructive Mode

Builds directly on the host without any VM or container (`snapcraft --destructive-mode`).

!!! warning
    **Not recommended for production builds.** Destructive mode pollutes the host environment — any library present on the host at build time can end up in the snap, making builds difficult to reproduce. Prefer `useLXD` or `useMultipass` for clean builds.

Valid reason(s) to use this mode:

- CI test suites where the environment is already fully controlled.

The `gnome` extension is **incompatible** with destructive mode. electron-builder automatically clears `extensions` when `useDestructiveMode` is set; explicitly including `"gnome"` alongside it will throw an error.

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "useDestructiveMode": true,
      "extensions": []
    }
  }
}
```

#### Remote Build on Launchpad

Builds on [Canonical's Launchpad](https://launchpad.net/) infrastructure. Works from any platform and supports building for multiple architectures simultaneously (`amd64`, `arm64`, `armhf`).

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "remoteBuild": {
        "enabled": true,
        "buildFor": ["amd64", "arm64"],
        "acceptPublicUpload": true
      }
    }
  }
}
```

!!! note
    Unless `privateProject` is set, your source code is uploaded to a **public** Launchpad repository. Set `acceptPublicUpload: true` to suppress the interactive consent prompt in CI.

##### Authentication

Remote builds require Snapcraft Store credentials. electron-builder resolves them in this order:

1. `remoteBuild.cscLink` — base64-encoded credentials or a file path in the build config.
2. `SNAP_CSC_LINK` — environment variable, same format (CI-recommended).
3. `SNAPCRAFT_STORE_CREDENTIALS` — plain-text macaroon, read directly by snapcraft.
4. An active interactive `snapcraft login` session.

Credentials are injected **only into the spawned `snapcraft` subprocess** environment and are never exposed through `process.env`.

This follows the same pattern as `WIN_CSC_LINK` / `CSC_LINK` for [code signing](./code-signing.md).

##### CI Setup

Generate credentials once and store as a CI secret:

```sh
# Run locally — output is your CI secret value
snapcraft export-login - | base64 -w0
```

Then set `SNAP_CSC_LINK` in your CI environment:

```yaml
# GitHub Actions
- name: Build and publish snap
  env:
    SNAP_CSC_LINK: ${{ secrets.SNAP_CSC_LINK }}
  run: npx electron-builder --linux snap
```

To reference credentials file directly via the config (useful for monorepos where the credential is managed per-project):

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "remoteBuild": {
        "enabled": true,
        "cscLink": "file://..."
      }
    }
  }
}
```

---

### GNOME Extension

By default, core24 builds apply the `gnome` extension, which:

- Pulls in the `gnome-46-2404` platform content snap (GTK3, GLib, etc.)
- Adds `gtk-3-themes`, `icon-themes`, `sound-themes` content snaps
- Adds the `gpu-2404` GPU support content snap
- Injects layout, environment variables, and plugs required by Electron on Ubuntu 24.04

You normally do not need to configure `extensions` at all. To opt out:

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "extensions": []
    }
  }
}
```

When `extensions` is empty, electron-builder falls back to the standard Electron plug set and you are responsible for layout and content snap declarations.

---

### Wayland

`allowNativeWayland` defaults to `true` for core24. The snap runs with `--ozone-platform=wayland` on compositors that support it and falls back to XWayland otherwise.

To force X11-only mode:

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "allowNativeWayland": false
    }
  }
}
```

---

### Stage Packages

The default stage packages are `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.

Use the `"default"` keyword to extend the defaults rather than replace them:

```json
{
  "snapcraft": {
    "base": "core24",
    "core24": {
      "stagePackages": ["default", "libv4l-0"]
    }
  }
}
```

---

## Core 22

`core22` targets Ubuntu 22.04 Jammy. It is the most recent **stable** (non-beta) base and is supported via the legacy `SnapCoreLegacy` implementation.

```json
{
  "snapcraft": {
    "base": "core22",
    "core22": {
      "summary": "My Electron app",
      "confinement": "strict",
      "stagePackages": ["default"]
    }
  }
}
```

Key differences from core24:

- **`allowNativeWayland` defaults to `false`** — Wayland is disabled by default for older Electron compatibility. Set to `true` to enable.
- **No extensions** — no GNOME extension support; uses the `desktop-gtk2` part instead.
- **`useTemplateApp`** — when `stagePackages` is not customised, electron-builder uses a pre-built Electron snap template for faster assembly (x64 and armv7l only).
- Build is handled by the `app-builder-bin` binary, not by a direct `snapcraft` invocation.

---

## Core 20

`core20` targets Ubuntu 20.04 Focal.

```json
{
  "snapcraft": {
    "base": "core20",
    "core20": {
      "summary": "My Electron app",
      "confinement": "strict"
    }
  }
}
```

Behaviour is identical to core22 above. Use core22 unless the Snap Store requires core20.

---

## Core 18

`core18` targets Ubuntu 18.04 Bionic. Use only if your store listing requires it.

```json
{
  "snapcraft": {
    "base": "core18",
    "core18": {
      "summary": "My Electron app",
      "confinement": "strict"
    }
  }
}
```

---

## Custom Pass-Through

Set `base: "custom"` to pass a `snapcraft.yaml` file (or an inline object) through to snapcraft verbatim. electron-builder performs no injection — no plugs, extensions, organize mappings, or desktop entries are added.

```json
{
  "snapcraft": {
    "base": "custom",
    "custom": {
      "yaml": "build/snapcraft.yaml"
    }
  }
}
```

The `yaml` path is resolved relative to the build resources directory (`build/` by default). You can also supply the YAML content inline as an object in the config.

---

## Migrating from `snap` to `snapcraft`

The legacy `snap` key is equivalent to using `snapcraft` with a per-core options object. The `base` field moves to the top level of `snapcraft`, and all other fields move inside the corresponding core key.

```jsonc
// Before — deprecated snap key
{
  "snap": {
    "base": "core22",
    "summary": "My app",
    "confinement": "strict",
    "stagePackages": ["default", "libfoo"]
  }
}

// After — snapcraft key (recommended)
{
  "snapcraft": {
    "base": "core22",
    "core22": {
      "summary": "My app",
      "confinement": "strict",
      "stagePackages": ["default", "libfoo"]
    }
  }
}
```

The `snap` key continues to work for `core22` and older. Omit `base` from the inner object — it lives at `snapcraft.base` now.

---

## Configuration

### `snapcraft` (new)

  {!./app-builder-lib.Interface.SnapcraftOptions.md!}

### `SnapOptions24` (core24)

  {!./app-builder-lib.Interface.SnapOptions24.md!}

### `RemoteBuildOptions`

  {!./app-builder-lib.Interface.RemoteBuildOptions.md!}

### `SnapOptionsCustom`

  {!./app-builder-lib.Interface.SnapOptionsCustom.md!}

### `snap` (legacy, deprecated)

  {!./app-builder-lib.Interface.SnapOptions.md!}
