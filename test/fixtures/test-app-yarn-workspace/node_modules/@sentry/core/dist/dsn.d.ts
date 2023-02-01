/** Supported Sentry transport protocols in a DSN. */
export declare type DSNProtocol = 'http' | 'https';
/** Primitive components of a DSN. */
export interface DSNComponents {
    /** Protocol used to connect to Sentry. */
    protocol: DSNProtocol;
    /** Public authorization key. */
    user: string;
    /** Private authorization key (deprecated, optional). */
    pass?: string;
    /** Hostname of the Sentry instance. */
    host: string;
    /** Port of the Sentry instance. */
    port?: string;
    /** Project path */
    path: string;
}
/** Anything that can be parsed into a DSN. */
export declare type DSNLike = string | DSNComponents;
/** The Sentry DSN, identifying a Sentry instance and project. */
export declare class DSN implements DSNComponents {
    /** Protocol used to connect to Sentry. */
    protocol: DSNProtocol;
    /** Public authorization key. */
    user: string;
    /** Private authorization key (deprecated, optional). */
    pass: string;
    /** Hostname of the Sentry instance. */
    host: string;
    /** Port of the Sentry instance. */
    port: string;
    /** Project path */
    path: string;
    /** Creates a new DSN component */
    constructor(from: DSNLike);
    /**
     * Renders the string representation of this DSN.
     *
     * By default, this will render the public representation without the password
     * component. To get the deprecated private representation, set `withPassword`
     * to true.
     *
     * @param withPassword When set to true, the password will be included.
     */
    toString(withPassword?: boolean): string;
    /** Parses a string into this DSN. */
    private fromString(str);
    /** Maps DSN components into this instance. */
    private fromComponents(components);
    /** Validates this DSN and throws on error. */
    private validate();
}
