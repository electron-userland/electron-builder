#! /usr/bin/env node

import { build, CliOptions } from "./builder"
import { printErrorAndExit } from "./promise"
import { createYargs } from "./cliOptions"

build(<CliOptions>(createYargs().argv))
  .catch(printErrorAndExit)