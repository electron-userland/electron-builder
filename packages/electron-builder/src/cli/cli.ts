#! /usr/bin/env node

import { getElectronVersion, nodeGypRebuild } from "app-builder-lib/internal"
import chalk from "chalk"
import { build, configureBuildCommand, createYargs } from "../builder.js"
import { configurePublishCommand, publish } from "../publish.js"
import { clearCache } from "./clear-cache.js"
import { wrap } from "./cli-util.js"
import { createSelfSignedCert } from "./create-self-signed-cert.js"
import { createUpdateKey } from "./create-update-key.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js"
import { configureMigrateSchemaCommand, migrateSchema } from "./migrate-schema.js"
import { signUpdateManifest } from "./sign-update-manifest.js"
import { start } from "./start.js"

// tslint:disable:no-unused-expression
void createYargs()
  .command(["build", "*"], "Build", configureBuildCommand, wrap(build))
  .command("install-app-deps", "Install app deps", configureInstallAppDepsCommand, wrap(installAppDeps))
  .command("node-gyp-rebuild", "Rebuild own native code", configureInstallAppDepsCommand /* yes, args the same as for install app deps */, wrap(rebuildAppNativeCode))
  .command("publish", "Publish a list of artifacts", configurePublishCommand, wrap(publish))
  .command(
    "create-self-signed-cert",
    "Create self-signed code signing cert for Windows apps",
    yargs =>
      yargs
        .option("publisher", {
          alias: ["p"],
          type: "string",
          requiresArg: true,
          description: "The publisher name",
        })
        .demandOption("publisher"),
    wrap(argv => createSelfSignedCert(argv.publisher))
  )
  .command(
    "start",
    "Run application in a development mode using electron-webpack",
    yargs => yargs,
    wrap(() => start())
  )
  .command(
    "clear-cache",
    "Clear the electron-builder default cache directory",
    yargs => yargs,
    wrap(() => clearCache())
  )
  .command(
    "create-update-key",
    "Generate an Ed25519 keypair for signing auto-update manifests",
    yargs =>
      yargs.option("out", {
        alias: ["o"],
        type: "string",
        requiresArg: true,
        description: "Path to write the private key PEM (default: ./update-private-key.pem)",
      }),
    wrap(argv => createUpdateKey(argv.out))
  )
  .command(
    "sign-update-manifest <files..>",
    "Re-sign edited auto-update manifests (latest*.yml) in place, or verify them",
    yargs =>
      yargs
        .positional("files", {
          type: "string",
          array: true,
          description: "Path(s) to the latest*.yml manifest(s)",
        })
        .option("key-file", {
          type: "string",
          array: true,
          requiresArg: true,
          description: "Path to the Ed25519 private key PEM (repeat to dual-sign). Default: ELECTRON_BUILDER_UPDATE_SIGN_KEY / ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE",
        })
        .option("verify", {
          type: "boolean",
          description: "Only verify the existing signatures; nothing is written",
        })
        .option("public-key", {
          type: "string",
          array: true,
          requiresArg: true,
          description: "Trusted public key (PEM file path, PEM or base64 SPKI) to verify against; implies --verify. Default: derived from the signing key(s)",
        }),
    wrap(argv => signUpdateManifest({ files: argv.files as Array<string>, keyFile: argv["key-file"], verify: argv.verify, publicKey: argv["public-key"] }))
  )
  .command("migrate-schema", "Migrate build config from v26 to v27 format", configureMigrateSchemaCommand, wrap(migrateSchema))
  .help()
  .epilog(`See ${chalk.underline("https://electron.build")} for more documentation.`)
  .strict()
  .recommendCommands().argv

async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  // this script must be used only for electron
  return nodeGypRebuild(args.platform, args.arch, { version: await getElectronVersion(projectDir), useCustomDist: true })
}
