/* eslint-disable*/
module.exports = {
  name: "@yarnpkg/plugin-workspace-tools",
  factory: function (require) {
                          var plugin =
  /******/ (function(modules) { // webpackBootstrap
  /******/ 	// The module cache
  /******/ 	var installedModules = {};
  /******/
  /******/ 	// The require function
  /******/ 	function __webpack_require__(moduleId) {
  /******/
  /******/ 		// Check if module is in cache
  /******/ 		if(installedModules[moduleId]) {
  /******/ 			return installedModules[moduleId].exports;
  /******/ 		}
  /******/ 		// Create a new module (and put it into the cache)
  /******/ 		var module = installedModules[moduleId] = {
  /******/ 			i: moduleId,
  /******/ 			l: false,
  /******/ 			exports: {}
  /******/ 		};
  /******/
  /******/ 		// Execute the module function
  /******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
  /******/
  /******/ 		// Flag the module as loaded
  /******/ 		module.l = true;
  /******/
  /******/ 		// Return the exports of the module
  /******/ 		return module.exports;
  /******/ 	}
  /******/
  /******/
  /******/ 	// expose the modules object (__webpack_modules__)
  /******/ 	__webpack_require__.m = modules;
  /******/
  /******/ 	// expose the module cache
  /******/ 	__webpack_require__.c = installedModules;
  /******/
  /******/ 	// define getter function for harmony exports
  /******/ 	__webpack_require__.d = function(exports, name, getter) {
  /******/ 		if(!__webpack_require__.o(exports, name)) {
  /******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
  /******/ 		}
  /******/ 	};
  /******/
  /******/ 	// define __esModule on exports
  /******/ 	__webpack_require__.r = function(exports) {
  /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
  /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
  /******/ 		}
  /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
  /******/ 	};
  /******/
  /******/ 	// create a fake namespace object
  /******/ 	// mode & 1: value is a module id, require it
  /******/ 	// mode & 2: merge all properties of value into the ns
  /******/ 	// mode & 4: return value when already ns object
  /******/ 	// mode & 8|1: behave like require
  /******/ 	__webpack_require__.t = function(value, mode) {
  /******/ 		if(mode & 1) value = __webpack_require__(value);
  /******/ 		if(mode & 8) return value;
  /******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
  /******/ 		var ns = Object.create(null);
  /******/ 		__webpack_require__.r(ns);
  /******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
  /******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
  /******/ 		return ns;
  /******/ 	};
  /******/
  /******/ 	// getDefaultExport function for compatibility with non-harmony modules
  /******/ 	__webpack_require__.n = function(module) {
  /******/ 		var getter = module && module.__esModule ?
  /******/ 			function getDefault() { return module['default']; } :
  /******/ 			function getModuleExports() { return module; };
  /******/ 		__webpack_require__.d(getter, 'a', getter);
  /******/ 		return getter;
  /******/ 	};
  /******/
  /******/ 	// Object.prototype.hasOwnProperty.call
  /******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
  /******/
  /******/ 	// __webpack_public_path__
  /******/ 	__webpack_require__.p = "";
  /******/
  /******/
  /******/ 	// Load entry module and return exports
  /******/ 	return __webpack_require__(__webpack_require__.s = 0);
  /******/ })
  /************************************************************************/
  /******/ ([
  /* 0 */
  /***/ (function(module, exports, __webpack_require__) {

  "use strict";


  var __importDefault = this && this.__importDefault || function (mod) {
    return mod && mod.__esModule ? mod : {
      "default": mod
    };
  };

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  const foreach_1 = __importDefault(__webpack_require__(1));

  const plugin = {
    commands: [foreach_1.default]
  }; // eslint-disable-next-line arca/no-default-export

  exports.default = plugin;

  /***/ }),
  /* 1 */
  /***/ (function(module, exports, __webpack_require__) {

  "use strict";


  var __decorate = this && this.__decorate || function (decorators, target, key, desc) {
    var c = arguments.length,
        r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc,
        d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
  };

  var __importDefault = this && this.__importDefault || function (mod) {
    return mod && mod.__esModule ? mod : {
      "default": mod
    };
  };

  var __importStar = this && this.__importStar || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
  };

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  const cli_1 = __webpack_require__(2);

  const core_1 = __webpack_require__(3);

  const core_2 = __webpack_require__(3);

  const core_3 = __webpack_require__(3);

  const clipanion_1 = __webpack_require__(4);

  const os_1 = __webpack_require__(5);

  const p_limit_1 = __importDefault(__webpack_require__(6));

  const yup = __importStar(__webpack_require__(8));
  /**
   * Retrieves all the child workspaces of a given root workspace recursively
   *
   * @param rootWorkspace root workspace
   * @param project project
   *
   * @returns all the child workspaces
   */


  const getWorkspaceChildrenRecursive = (rootWorkspace, project) => {
    const workspaceList = [];

    for (const childWorkspaceCwd of rootWorkspace.workspacesCwds) {
      const childWorkspace = project.workspacesByCwd.get(childWorkspaceCwd);

      if (childWorkspace) {
        workspaceList.push(childWorkspace, ...getWorkspaceChildrenRecursive(childWorkspace, project));
      }
    }

    return workspaceList;
  }; // eslint-disable-next-line arca/no-default-export


  class WorkspacesForeachCommand extends cli_1.BaseCommand {
    constructor() {
      super(...arguments);
      this.args = [];
      this.all = false;
      this.verbose = false;
      this.parallel = false;
      this.interlaced = false;
      this.topological = false;
      this.topologicalDev = false;
      this.include = [];
      this.exclude = [];
      this.private = true;
    }

    async execute() {
      const configuration = await core_1.Configuration.find(this.context.cwd, this.context.plugins);
      const {
        project,
        workspace: cwdWorkspace
      } = await core_1.Project.find(configuration, this.context.cwd);
      if (!this.all && !cwdWorkspace) throw new cli_1.WorkspaceRequiredError(project.cwd, this.context.cwd);
      const command = this.cli.process([this.commandName, ...this.args]);
      const scriptName = command.path.length === 1 && command.path[0] === `run` && typeof command.scriptName !== `undefined` ? command.scriptName : null;
      if (command.path.length === 0) throw new clipanion_1.UsageError(`Invalid subcommand name for iteration - use the 'run' keyword if you wish to execute a script`);
      const rootWorkspace = this.all ? project.topLevelWorkspace : cwdWorkspace;
      const candidates = [rootWorkspace, ...getWorkspaceChildrenRecursive(rootWorkspace, project)];
      const workspaces = [];

      for (const workspace of candidates) {
        if (scriptName && !workspace.manifest.scripts.has(scriptName)) continue; // Prevents infinite loop in the case of configuring a script as such:
        // "lint": "yarn workspaces foreach --all lint"

        if (scriptName === process.env.npm_lifecycle_event && workspace.cwd === cwdWorkspace.cwd) continue;
        if (this.include.length > 0 && !this.include.includes(core_3.structUtils.stringifyIdent(workspace.locator))) continue;
        if (this.exclude.length > 0 && this.exclude.includes(core_3.structUtils.stringifyIdent(workspace.locator))) continue;
        if (this.private === false && workspace.manifest.private === true) continue;
        workspaces.push(workspace);
      }

      let interlaced = this.interlaced; // No need to buffer the output if we're executing the commands sequentially

      if (!this.parallel) interlaced = true;
      const needsProcessing = new Map();
      const processing = new Set();
      const concurrency = this.parallel ? Math.max(1, os_1.cpus().length / 2) : 1;
      const limit = p_limit_1.default(this.jobs || concurrency);
      let commandCount = 0;
      let finalExitCode = null;
      const report = await core_2.StreamReport.start({
        configuration,
        stdout: this.context.stdout
      }, async report => {
        const runCommand = async (workspace, {
          commandIndex
        }) => {
          if (!this.parallel && this.verbose && commandIndex > 1) report.reportSeparator();
          const prefix = getPrefix(workspace, {
            configuration,
            verbose: this.verbose,
            commandIndex
          });
          const [stdout, stdoutEnd] = createStream(report, {
            prefix,
            interlaced
          });
          const [stderr, stderrEnd] = createStream(report, {
            prefix,
            interlaced
          });

          try {
            const exitCode = (await this.cli.run([this.commandName, ...this.args], {
              cwd: workspace.cwd,
              stdout,
              stderr
            })) || 0;
            stdout.end();
            stderr.end();
            const emptyStdout = await stdoutEnd;
            const emptyStderr = await stderrEnd;
            if (this.verbose && emptyStdout && emptyStderr) report.reportInfo(null, `${prefix} Process exited without output (exit code ${exitCode})`);
            return exitCode;
          } catch (err) {
            stdout.end();
            stderr.end();
            await stdoutEnd;
            await stderrEnd;
            throw err;
          }
        };

        for (const workspace of workspaces) needsProcessing.set(workspace.anchoredLocator.locatorHash, workspace);

        while (needsProcessing.size > 0) {
          if (report.hasErrors()) break;
          const commandPromises = [];

          for (const [identHash, workspace] of needsProcessing) {
            // If we are already running the command on that workspace, skip
            if (processing.has(workspace.anchoredDescriptor.descriptorHash)) continue;
            let isRunnable = true;

            if (this.topological || this.topologicalDev) {
              const resolvedSet = this.topologicalDev ? new Map([...workspace.manifest.dependencies, ...workspace.manifest.devDependencies]) : workspace.manifest.dependencies;

              for (const descriptor of resolvedSet.values()) {
                const workspace = project.tryWorkspaceByDescriptor(descriptor);
                isRunnable = workspace === null || !needsProcessing.has(workspace.anchoredLocator.locatorHash);

                if (!isRunnable) {
                  break;
                }
              }
            }

            if (!isRunnable) continue;
            processing.add(workspace.anchoredDescriptor.descriptorHash);
            commandPromises.push(limit(async () => {
              const exitCode = await runCommand(workspace, {
                commandIndex: ++commandCount
              });
              needsProcessing.delete(identHash);
              processing.delete(workspace.anchoredDescriptor.descriptorHash);
              return exitCode;
            })); // If we're not executing processes in parallel we can just wait for it
            // to finish outside of this loop (it'll then reenter it anyway)

            if (!this.parallel) {
              break;
            }
          }

          if (commandPromises.length === 0) {
            const cycle = Array.from(needsProcessing.values()).map(workspace => {
              return core_3.structUtils.prettyLocator(configuration, workspace.anchoredLocator);
            }).join(`, `);
            return report.reportError(core_2.MessageName.CYCLIC_DEPENDENCIES, `Dependency cycle detected (${cycle})`);
          }

          const exitCodes = await Promise.all(commandPromises);
          const errorCode = exitCodes.find(code => code !== 0); // The order in which the exit codes will be processed is fairly
          // opaque, so better just return a generic "1" for determinism.

          finalExitCode = typeof errorCode !== `undefined` ? 1 : finalExitCode;

          if ((this.topological || this.topologicalDev) && typeof errorCode !== `undefined`) {
            report.reportError(core_2.MessageName.UNNAMED, `The command failed for workspaces that are depended upon by other workspaces; can't satisfy the dependency graph`);
          }
        }
      });

      if (finalExitCode !== null) {
        return finalExitCode;
      } else {
        return report.exitCode();
      }
    }

  }

  WorkspacesForeachCommand.schema = yup.object().shape({
    jobs: yup.number().min(2),
    parallel: yup.boolean().when(`jobs`, {
      is: val => val > 1,
      then: yup.boolean().oneOf([true], `--parallel must be set when using --jobs`),
      otherwise: yup.boolean()
    })
  });
  WorkspacesForeachCommand.usage = clipanion_1.Command.Usage({
    category: `Workspace-related commands`,
    description: `run a command on all workspaces`,
    details: `
        > In order to use this command you will need to add \`@yarnpkg/plugin-workspace-tools\` to your plugins. Check the documentation for \`yarn plugin import\` for more details.

        This command will run a given sub-command on all child workspaces that define it (any workspace that doesn't define it will be just skiped). Various flags can alter the exact behavior of the command:

        - If \`-p,--parallel\` is set, the commands will run in parallel; they'll by default be limited to a number of parallel tasks roughly equal to half your core number, but that can be overriden via \`-j,--jobs\`.

        - If \`-p,--parallel\` and \`-i,--interlaced\` are both set, Yarn will print the lines from the output as it receives them. If \`-i,--interlaced\` wasn't set, it would instead buffer the output from each process and print the resulting buffers only after their source processes have exited.

        - If \`-t,--topological\` is set, Yarn will only run a command after all workspaces that depend on it through the \`dependencies\` field have successfully finished executing. If \`--tological-dev\` is set, both the \`dependencies\` and \`devDependencies\` fields will be considered when figuring out the wait points.

        - If \`--all\` is set, Yarn will run it on all the workspaces of a project. By default it runs the command only on child workspaces.

        - The command may apply to only some workspaces through the use of \`--include\` which acts as a whitelist. The \`--exclude\` flag will do the opposite and will be a list of packages that musn't execute the script.

        Adding the \`-v,--verbose\` flag will cause Yarn to print more information; in particular the name of the workspace that generated the output will be printed at the front of each line.

        If the command is \`run\` and the script being run does not exist the child workspace will be skipped without error.
      `,
    examples: [[`Publish all the packages in a workspace`, `yarn workspaces foreach npm publish --tolerate-republish`], [`Run build script on all the packages in a workspace`, `yarn workspaces foreach run build`], [`Run build script on all the packages in a workspace in parallel, building dependent packages first`, `yarn workspaces foreach -pt run build`]]
  });

  __decorate([clipanion_1.Command.String()], WorkspacesForeachCommand.prototype, "commandName", void 0);

  __decorate([clipanion_1.Command.Proxy()], WorkspacesForeachCommand.prototype, "args", void 0);

  __decorate([clipanion_1.Command.Boolean(`-a,--all`)], WorkspacesForeachCommand.prototype, "all", void 0);

  __decorate([clipanion_1.Command.Boolean(`-v,--verbose`)], WorkspacesForeachCommand.prototype, "verbose", void 0);

  __decorate([clipanion_1.Command.Boolean(`-p,--parallel`)], WorkspacesForeachCommand.prototype, "parallel", void 0);

  __decorate([clipanion_1.Command.Boolean(`-i,--interlaced`)], WorkspacesForeachCommand.prototype, "interlaced", void 0);

  __decorate([clipanion_1.Command.String(`-j,--jobs`)], WorkspacesForeachCommand.prototype, "jobs", void 0);

  __decorate([clipanion_1.Command.Boolean(`-t,--topological`)], WorkspacesForeachCommand.prototype, "topological", void 0);

  __decorate([clipanion_1.Command.Boolean(`--topological-dev`)], WorkspacesForeachCommand.prototype, "topologicalDev", void 0);

  __decorate([clipanion_1.Command.Array(`--include`)], WorkspacesForeachCommand.prototype, "include", void 0);

  __decorate([clipanion_1.Command.Array(`--exclude`)], WorkspacesForeachCommand.prototype, "exclude", void 0);

  __decorate([clipanion_1.Command.Boolean(`--private`)], WorkspacesForeachCommand.prototype, "private", void 0);

  __decorate([clipanion_1.Command.Path(`workspaces`, `foreach`)], WorkspacesForeachCommand.prototype, "execute", null);

  exports.default = WorkspacesForeachCommand;

  function createStream(report, {
    prefix,
    interlaced
  }) {
    const streamReporter = report.createStreamReporter(prefix);
    const defaultStream = new core_3.miscUtils.DefaultStream();
    defaultStream.pipe(streamReporter, {
      end: false
    });
    defaultStream.on(`finish`, () => {
      streamReporter.end();
    });
    const promise = new Promise(resolve => {
      streamReporter.on(`finish`, () => {
        resolve(defaultStream.active);
      });
    });
    if (interlaced) return [defaultStream, promise];
    const streamBuffer = new core_3.miscUtils.BufferStream();
    streamBuffer.pipe(defaultStream, {
      end: false
    });
    streamBuffer.on(`finish`, () => {
      defaultStream.end();
    });
    return [streamBuffer, promise];
  }

  function getPrefix(workspace, {
    configuration,
    commandIndex,
    verbose
  }) {
    if (!verbose) return null;
    const ident = core_3.structUtils.convertToIdent(workspace.locator);
    const name = core_3.structUtils.stringifyIdent(ident);
    let prefix = `[${name}]:`;
    const colors = [`#2E86AB`, `#A23B72`, `#F18F01`, `#C73E1D`, `#CCE2A3`];
    const colorName = colors[commandIndex % colors.length];
    return configuration.format(prefix, colorName);
  }

  /***/ }),
  /* 2 */
  /***/ (function(module, exports) {

  module.exports = require("@yarnpkg/cli");

  /***/ }),
  /* 3 */
  /***/ (function(module, exports) {

  module.exports = require("@yarnpkg/core");

  /***/ }),
  /* 4 */
  /***/ (function(module, exports) {

  module.exports = require("clipanion");

  /***/ }),
  /* 5 */
  /***/ (function(module, exports) {

  module.exports = require("os");

  /***/ }),
  /* 6 */
  /***/ (function(module, exports, __webpack_require__) {

  "use strict";

  const pTry = __webpack_require__(7);

  const pLimit = concurrency => {
  	if (concurrency < 1) {
  		throw new TypeError('Expected `concurrency` to be a number from 1 and up');
  	}

  	const queue = [];
  	let activeCount = 0;

  	const next = () => {
  		activeCount--;

  		if (queue.length > 0) {
  			queue.shift()();
  		}
  	};

  	const run = (fn, resolve, ...args) => {
  		activeCount++;

  		const result = pTry(fn, ...args);

  		resolve(result);

  		result.then(next, next);
  	};

  	const enqueue = (fn, resolve, ...args) => {
  		if (activeCount < concurrency) {
  			run(fn, resolve, ...args);
  		} else {
  			queue.push(run.bind(null, fn, resolve, ...args));
  		}
  	};

  	const generator = (fn, ...args) => new Promise(resolve => enqueue(fn, resolve, ...args));
  	Object.defineProperties(generator, {
  		activeCount: {
  			get: () => activeCount
  		},
  		pendingCount: {
  			get: () => queue.length
  		}
  	});

  	return generator;
  };

  module.exports = pLimit;
  module.exports.default = pLimit;


  /***/ }),
  /* 7 */
  /***/ (function(module, exports, __webpack_require__) {

  "use strict";


  module.exports = (callback, ...args) => new Promise(resolve => {
  	resolve(callback(...args));
  });


  /***/ }),
  /* 8 */
  /***/ (function(module, exports) {

  module.exports = require("yup");

  /***/ })
  /******/ ]);
    return plugin;
  },
};
