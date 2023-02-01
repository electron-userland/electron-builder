export type LogLevel = "error" | "warn" | "info" | "verbose" | "debug" | "silly";
export type LevelOption = LogLevel | false;

export type IFormat = (msg: ILogMessage) => void;

export interface ILogMessage {
    data: any[];
    date: Date;
    level: LogLevel;
}

export interface IConsoleTransport {
    (msg: ILogMessage): void;
    level: LevelOption;
    format: IFormat | string;
}

export interface IFileTransport {
    (msg: ILogMessage): void;
    appName?: string;
    file?: string;
    format: IFormat | string;
    level: LevelOption;
    maxSize: number;
    streamConfig?: object;
    findLogPath(appName: string): string;
}

export interface ILogSTransport {
    (msg: ILogMessage): void;
    client: object;
    depth: number;
    level: LevelOption;
    url?: string;
}

export declare function error(...params: any[]): void;
export declare function warn(...params: any[]): void;
export declare function info(...params: any[]): void;
export declare function verbose(...params: any[]): void;
export declare function debug(...params: any[]): void;
export declare function silly(...params: any[]): void;

export declare const transports: {
    console: IConsoleTransport;
    file: IFileTransport;
    logS: ILogSTransport;
    rendererConsole: IConsoleTransport;
};

// tslint:disable object-literal-sort-keys
export default {
    error,
    warn,
    info,
    verbose,
    debug,
    silly,
    transports,
};
