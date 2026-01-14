/**
 * Latest TypeScript types for snapcraft.yaml
 * Focuses on the most common Core24 configuration
 * Based on https://snapcraft.io/docs/snapcraft-yaml-reference
 *    npm install -g json-schema-to-typescript
 *    curl -o snapcraft-schema.json https://raw.githubusercontent.com/canonical/snapcraft/refs/heads/main/schema/snapcraft.json
 *    npx json2ts -i snapcraft-schema.json -o snapcraft.ts
 * (manual edits to simplify and make more strict)
 */

export interface SnapcraftYAML {
  // === Required Fields ===
  /** The identifying name of the snap */
  name: string
  /** The baseline system that the snap is built in */
  base: "core22" | "core24" | "core26" | "bare" | "devel"
  /** The amount of isolation the snap has from the host system */
  confinement: "classic" | "devmode" | "strict"
  /** The self-contained software pieces needed to create the final artifact */
  parts: Record<string, Part>

  // === Metadata ===
  version?: string
  title?: string
  /** A short description of the project (max 78 chars) */
  summary?: string
  description?: string
  grade?: "stable" | "devel"
  /** The project's license as an SPDX expression */
  license?: string
  /** The path to the snap's icon file */
  icon?: string

  // === Build Configuration ===
  /** The baseline system that the snap is built in */
  "build-base"?: string
  /** The platforms where the snap can be built and run (core24+) */
  platforms?: Record<string, Platform>
  /** The architectures that the snap builds and runs on (core22 and earlier) */
  architectures?: (string | Architecture)[]
  /** Specifies the algorithm that compresses the snap */
  compression?: "lzo" | "xz"

  // === Apps and Services ===
  /** The individual programs and services that the snap runs */
  apps?: Record<string, App>

  // === Interfaces ===
  /** Declares the snap's plugs */
  plugs?: Record<string, unknown>
  /** Declares the snap's slots */
  slots?: Record<string, unknown>

  // === Hooks ===
  /** Configures the snap's hooks */
  hooks?: Record<string, Hook>

  // === Layout ===
  /** The file layouts in the execution environment */
  layout?: Record<string, Record<string, string>>

  // === Environment ===
  /** The snap's runtime environment variables */
  environment?: Record<string, string | null>

  // === Advanced ===
  /** The minimum version of snapd and features the snap requires */
  assumes?: string[]
  /** The epoch associated with this version of the snap */
  epoch?: string
  /** The package repositories to use for build and stage packages */
  "package-repositories"?: Array<Record<string, unknown>>
  /** Selects a part to inherit metadata from */
  "adopt-info"?: string
  /** The system usernames the snap can use */
  "system-usernames"?: Record<string, unknown>
  /** Ubuntu Pro services to enable when building */
  "ua-services"?: string[]
  /** The linter configuration settings */
  lint?: {
    ignore: (string | Record<string, string[]>)[]
  }
  /** Components to build in conjunction with the snap */
  components?: Record<string, Component>
  /** Snap type */
  type?: "app" | "gadget" | "base" | "kernel" | "snapd"
  /** Attributes to pass to snap's metadata file */
  passthrough?: Record<string, unknown>

  // === Contact/Links ===
  /** The snap author's contact links and email addresses */
  contact?: string | string[]
  /** Links for submitting issues, bugs, and feature requests */
  issues?: string | string[]
  /** Links to the source code */
  "source-code"?: string | string[]
  /** The snap's donation links */
  donation?: string | string[]
  /** Links to the original software's web pages */
  website?: string | string[]
  /** Primary-key header for snaps signed by third parties */
  provenance?: string
}

// === Part Definition ===
export interface Part {
  /** Plugin to use for building */
  plugin: string

  // Source
  source?: string
  "source-type"?: "git" | "bzr" | "hg" | "svn" | "tar" | "zip" | "7z" | "deb" | "rpm" | "local"
  "source-branch"?: string
  "source-tag"?: string
  "source-commit"?: string
  "source-depth"?: number
  "source-subdir"?: string
  "source-checksum"?: string

  // Dependencies
  "build-packages"?: string[]
  "stage-packages"?: string[]
  "build-snaps"?: string[]
  "stage-snaps"?: string[]

  // Build configuration
  "build-environment"?: Array<Record<string, string>>

  // Overrides
  "override-build"?: string
  "override-pull"?: string
  "override-stage"?: string
  "override-prime"?: string

  // File organization
  organize?: Record<string, string>
  stage?: string[]
  prime?: string[]

  // Dependencies
  after?: string[]

  // Plugin-specific options (allow any additional properties)
  // [key: string]: unknown
}

// === Platform Definition (Core24+) ===
export interface Platform {
  /** The architectures to build the snap on */
  "build-on"?: string | string[]
  /** The target architecture for the build */
  "build-for"?: string | string[]
}

// === Architecture Definition (Core22 and earlier) ===
export interface Architecture {
  /** The architectures to build the snap on */
  "build-on": string | string[]
  /** The target architecture for the build */
  "build-for"?: string | string[]
}

// === App Definition ===
export interface App {
  /** The command to run inside the snap when invoked */
  command: string

  // Extensions
  /** The extensions to add to the app (e.g., 'gnome', 'kde-neon') */
  extensions?: string[]

  // Interfaces
  /** The interfaces that the app can connect to */
  plugs?: string[]
  /** The list of slots that the app provides */
  slots?: string[]

  // Daemon/Service configuration
  /** Configures the app as a service */
  daemon?: "simple" | "forking" | "oneshot" | "notify" | "dbus"
  "daemon-scope"?: "system" | "user"
  after?: string[]
  before?: string[]
  "refresh-mode"?: "endure" | "restart" | "ignore-running"
  "stop-mode"?: "sigterm" | "sigterm-all" | "sighup" | "sighup-all" | "sigusr1" | "sigusr1-all" | "sigusr2" | "sigusr2-all" | "sigint" | "sigint-all"
  "restart-condition"?: "on-success" | "on-failure" | "on-abnormal" | "on-abort" | "on-watchdog" | "always" | "never"
  "install-mode"?: "enable" | "disable"

  // Commands
  "stop-command"?: string
  "post-stop-command"?: string
  "reload-command"?: string

  // Timeouts
  "start-timeout"?: string
  "stop-timeout"?: string
  "watchdog-timeout"?: string
  "restart-delay"?: string

  // Desktop integration
  desktop?: string
  autostart?: string
  "common-id"?: string
  completer?: string

  // D-Bus
  "bus-name"?: string
  "activates-on"?: string[]

  // Sockets
  sockets?: Record<string, Socket>
  timer?: string

  // Environment
  environment?: Record<string, string>
  "command-chain"?: string[]

  // Other
  aliases?: string[]
  "success-exit-status"?: number[]
  passthrough?: Record<string, unknown>
}

// === Socket Definition ===
export interface Socket {
  /** The socket's abstract name or socket path */
  "listen-stream": number | string
  /** The mode or permissions of the socket in octal */
  "socket-mode"?: number
}

// === Hook Definition ===
export interface Hook {
  /** The ordered list of commands to run before the hook runs */
  "command-chain"?: string[]
  /** The environment variables for the hook */
  environment?: Record<string, string | null>
  /** The list of interfaces that the hook can connect to */
  plugs?: string[]
  /** Attributes to pass to snap's metadata file for the hook */
  passthrough?: Record<string, unknown>
}

// === Component Definition ===
export interface Component {
  /** The summary of the component */
  summary: string
  /** The full description of the component */
  description: string
  /** The type of the component */
  type: "test" | "kernel-modules" | "standard"
  /** The version of the component */
  version?: string
  /** The configuration for the component's hooks */
  hooks?: Record<string, Hook>
  /** Selects a part to inherit metadata from */
  "adopt-info"?: string
}
