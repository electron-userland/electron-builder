/** TODO */
export declare enum Severity {
    /** TODO */
    Fatal = "fatal",
    /** TODO */
    Error = "error",
    /** TODO */
    Warning = "warning",
    /** TODO */
    Info = "info",
    /** TODO */
    Debug = "debug",
    /** TODO */
    Critical = "critical",
}
/** TODO */
export interface Breadcrumb {
    type?: string;
    level?: Severity;
    event_id?: string;
    category?: string;
    message?: string;
    data?: any;
    timestamp?: number;
}
/** TODO */
export interface User {
    id?: string;
    ip_address?: string;
    email?: string;
    username?: string;
    extra?: any;
}
/** TODO */
export interface Context {
    tags?: {
        [key: string]: string;
    };
    extra?: object;
    user?: User;
}
/** TODO */
export interface SdkInfo {
    version?: string;
    name?: string;
    integrations?: string[];
}
/** TODO */
export interface StackFrame {
    filename?: string;
    function?: string;
    module?: string;
    platform?: string;
    lineno?: number;
    colno?: number;
    abs_path?: string;
    context_line?: string;
    pre_context?: string;
    post_context?: string;
    in_app?: boolean;
    vars?: {
        [name: string]: any;
    };
}
/** TODO */
export interface Stacktrace {
    frames?: StackFrame[];
    frames_omitted?: [number, number];
}
/** TODO */
export interface Thread {
    id?: number;
    name?: string;
    stacktrace?: Stacktrace;
    crashed?: boolean;
    current?: boolean;
}
/** TODO */
export interface SentryException {
    type?: string;
    value?: string;
    module?: string;
    thread_id?: number;
    stacktrace?: Stacktrace;
}
/** TODO */
export interface Request {
    url?: string;
    method?: string;
    data?: any;
    query_string?: string;
    cookies?: {
        [key: string]: string;
    };
    env?: {
        [key: string]: string;
    };
    headers?: {
        [key: string]: string;
    };
}
/** TODO */
export interface SentryEvent extends Context {
    event_id?: string;
    message?: string;
    timestamp?: number;
    level?: Severity;
    platform?: string;
    logger?: string;
    server?: string;
    release?: string;
    dist?: string;
    environment?: string;
    sdk?: SdkInfo;
    request?: Request;
    modules?: {
        [key: string]: string;
    };
    fingerprint?: string[];
    exception?: SentryException[];
    stacktrace?: Stacktrace;
    breadcrumbs?: Breadcrumb[];
    contexts?: {
        [key: string]: object;
    };
}
