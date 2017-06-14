declare namespace yargs {
  interface Yargs {
    argv: any;

    (...args: any[]): any;

    parse(...args: any[]): any;

    reset(): Yargs;

    locale(): string;

    locale(loc: string): Yargs;

    detectLocale(detect: boolean): Yargs;

    terminalWidth(): number;

    alias(shortName: string, longName: string): Yargs;

    alias(aliases: { [shortName: string]: string }): Yargs;

    alias(aliases: { [shortName: string]: string[] }): Yargs;

    array(key: string): Yargs;

    array(keys: string[]): Yargs;

    default(key: string, value: any, description?: string): Yargs;

    default(defaults: { [key: string]: any }, description?: string): Yargs;

    /**
     * @deprecated since version 6.6.0
     */
    demand(key: string, msg: string): Yargs;

    demand(key: string, required?: boolean): Yargs;

    demand(keys: string[], msg: string): Yargs;

    demand(keys: string[], required?: boolean): Yargs;

    demand(positionals: number, required?: boolean): Yargs;

    demand(positionals: number, msg: string): Yargs;

    demand(positionals: number, max: number, msg?: string): Yargs;

    demandCommand(min: number, minMsg?: string): Yargs;

    demandCommand(min: number, max?: number, minMsg?: string, maxMsg?: string): Yargs;

    demandOption(key: string | string[], msg?: string): Yargs;

    demandOption(key: string | string[], demand?: boolean): Yargs;

    /**
     * @deprecated since version 6.6.0
     */
    require(key: string, msg: string): Yargs;

    require(key: string, required: boolean): Yargs;

    require(keys: number[], msg: string): Yargs;

    require(keys: number[], required: boolean): Yargs;

    require(positionals: number, required: boolean): Yargs;

    require(positionals: number, msg: string): Yargs;

    /**
     * @deprecated since version 6.6.0
     */
    required(key: string, msg: string): Yargs;

    required(key: string, required: boolean): Yargs;

    required(keys: number[], msg: string): Yargs;

    required(keys: number[], required: boolean): Yargs;

    required(positionals: number, required: boolean): Yargs;

    required(positionals: number, msg: string): Yargs;

    requiresArg(key: string): Yargs;

    requiresArg(keys: string[]): Yargs;

    describe(key: string, description: string): Yargs;

    describe(descriptions: { [key: string]: string }): Yargs;

    option(key: string, options: Options): Yargs;

    option(options: { [key: string]: Options }): Yargs;

    options(key: string, options: Options): Yargs;

    options(options: { [key: string]: Options }): Yargs;

    usage(message: string, options?: { [key: string]: Options }): Yargs;

    usage(options?: { [key: string]: Options }): Yargs;

    command(command: string, description: string): Yargs;

    command(command: string | Array<string>, description: string, builder: (args: Yargs) => Yargs): Yargs;

    command(command: string | Array<string>, description: string, builder: { [optionName: string]: Options }): Yargs;

    // command(command: string, description: string, builder: { [optionName: string]: Options }, handler: (args: any) => void): Yargs;

    command(command: string | Array<string>, description: string, builder: (args: Yargs) => Yargs, handler: (args: any) => void): Yargs;

    command(command: string | Array<string>, description: string, module: CommandModule): Yargs;

    command(module: CommandModule): Yargs;

    commandDir(dir: string, opts?: RequireDirectoryOptions): Yargs;

    completion(): Yargs;

    completion(cmd: string, fn?: AsyncCompletionFunction): Yargs;

    completion(cmd: string, fn?: SyncCompletionFunction): Yargs;

    completion(cmd: string | undefined, description?: string, fn?: AsyncCompletionFunction): Yargs;

    completion(cmd: string, description?: string, fn?: SyncCompletionFunction): Yargs;

    example(command: string, description: string): Yargs;

    check(func: (Yargs: any, aliases: { [alias: string]: string }) => any): Yargs;

    boolean(key: string): Yargs;

    boolean(keys: string[]): Yargs;

    string(key: string): Yargs;

    string(keys: string[]): Yargs;

    number(key: string): Yargs;

    number(keys: string[]): Yargs;

    choices(choices: Object): Yargs;

    choices(key: string, values: any[]): Yargs;

    config(): Yargs;

    config(explicitConfigurationObject: Object): Yargs;

    config(key: string, description?: string, parseFn?: (configPath: string) => Object): Yargs;

    config(keys: string[], description?: string, parseFn?: (configPath: string) => Object): Yargs;

    config(key: string, parseFn: (configPath: string) => Object): Yargs;

    config(keys: string[], parseFn: (configPath: string) => Object): Yargs;

    conflicts(key: string, value: string): Yargs;

    conflicts(conflicts: { [key: string]: string }): Yargs;

    wrap(columns: number): Yargs;

    strict(): Yargs;

    help(): Yargs;

    help(enableExplicit: boolean): Yargs;

    help(option: string, enableExplicit: boolean): Yargs;

    help(option: string, description?: string, enableExplicit?: boolean): Yargs;

    env(prefix?: string): Yargs;

    env(enable: boolean): Yargs;

    epilog(msg: string): Yargs;

    epilogue(msg: string): Yargs;

    version(version?: string, option?: string, description?: string): Yargs;

    version(version: () => string, option?: string, description?: string): Yargs;

    showHelpOnFail(enable: boolean, message?: string): Yargs;

    showHelp(consoleLevel?: string): Yargs;

    exitProcess(enabled: boolean): Yargs;

    global(key: string): Yargs;

    global(keys: string[]): Yargs;

    group(key: string, groupName: string): Yargs;

    group(keys: string[], groupName: string): Yargs;

    nargs(key: string, count: number): Yargs;

    nargs(nargs: { [key: string]: number }): Yargs;

    normalize(key: string): Yargs;

    normalize(keys: string[]): Yargs;

    implies(key: string, value: string): Yargs;

    implies(implies: { [key: string]: string }): Yargs;

    count(key: string): Yargs;

    count(keys: string[]): Yargs;

    fail(func: (msg: string, err: Error) => any): Yargs;

    coerce<T, U>(key: string | string[], func: (arg: T) => U): Yargs;

    coerce<T, U>(opts: { [key: string]: (arg: T) => U; }): Yargs;

    getCompletion(args: string[], done: (completions: string[]) => void): Yargs;

    pkgConf(key: string, cwd?: string): Yargs;

    pkgConf(keys: string[], cwd?: string): Yargs;

    recommendCommands(): Yargs;

    showCompletionScript(): Yargs;

    skipValidation(key: string): Yargs;

    skipValidation(keys: string[]): Yargs;

    updateLocale(obj: Object): Yargs;

    updateStrings(obj: { [key: string]: string }): Yargs;
  }

  interface RequireDirectoryOptions {
    recurse?: boolean;
    extensions?: string[];
    visit?: (commandObject: any, pathToFile?: string, filename?: string) => any;
    include?: RegExp | ((pathToFile: string) => boolean);
    exclude?: RegExp | ((pathToFile: string) => boolean);
  }

  interface Options {
    alias?: string | string[];
    array?: boolean;
    boolean?: boolean;
    choices?: string[];
    coerce?: (arg: any) => any;
    config?: boolean;
    configParser?: (configPath: string) => Object;
    count?: boolean;
    default?: any;
    defaultDescription?: string;
    /** @deprecated since version 6.6.0 */
    demand?: boolean | string;
    demandOption?: boolean | string;
    desc?: string;
    describe?: string;
    description?: string;
    global?: boolean;
    group?: string;
    nargs?: number;
    normalize?: boolean;
    number?: boolean;
    require?: boolean | string;
    required?: boolean | string;
    requiresArg?: boolean | string;
    skipValidation?: boolean;
    string?: boolean;
    type?: "array" | "boolean" | "count" | "number" | "string";
  }

  interface CommandModule {
    aliases?: string[] | string;
    builder?: CommandBuilder;
    command?: string[] | string;
    describe?: string | false;
    handler: (args: any) => void;
  }

  type CommandBuilder = { [key: string]: Options } | ((args: Yargs) => Yargs);
  type SyncCompletionFunction = (current: string, Yargs: any) => string[];
  type AsyncCompletionFunction = (current: string, Yargs: any, done: (completion: string[]) => void) => void;
}

declare module "yargs" {
  const yargs: yargs.Yargs;
  export default yargs;
}
