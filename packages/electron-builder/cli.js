#! /usr/bin/env node

import { assertNodeVersion } from "./assert-node-version.js"

assertNodeVersion()

import("./dist/cli/cli.js")
