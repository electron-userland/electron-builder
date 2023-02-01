import { ScopeLayer } from './interfaces';
/**
 * API compatibility version of this shim.
 *
 * WARNING: This number should only be incresed when the global interface
 * changes a and new methods are introduced.
 */
export declare const API_VERSION = 1;
/**
 * Internal class used to make sure we always have the latest internal functions
 * working in case we have a version conflict.
 */
export declare class Shim {
    readonly version: number;
    /** Creates a new shim instance. */
    constructor(version?: number);
    /**
     * Checks if this shim's version is older than the given version.
     *
     * @param version A version number to compare to.
     * @return True if the given version is newer; otherwise false.
     */
    isOlderThan(version: number): boolean;
    /**
     * Creates a new 'local' ScopeLayer with the given client.
     * @param client Optional client, defaults to the current client.
     */
    pushScope(client?: any): void;
    /** Removes the top most ScopeLayer of the current stack. */
    popScope(): boolean;
    /**
     * Convenience method for pushScope and popScope.
     *
     * @param arg1 Either the client or callback.
     * @param arg2 Either the client or callback.
     */
    withScope(arg1: (() => void) | any, arg2?: (() => void) | any): void;
    /** Resets the current scope to the initialScope. */
    clearScope(): void;
    /** Returns the client of the currently active scope. */
    getCurrentClient(): any | undefined;
    /** Returns the scope stack for domains or the process. */
    getStack(): ScopeLayer[];
    /** Returns the topmost scope layer in the order domain > local > process. */
    getStackTop(): ScopeLayer;
    /** Returns the topmost ScopeLayer from the global stack. */
    private getGlobalStackTop();
    /** Tries to return the top most ScopeLayer from the domainStack. */
    private getDomainStackTop();
    /**
     * Obtains a new scope instance from the client.
     *
     * @param client An SDK client that implements `getInitialScope`.
     * @returns The scope instance or an empty object on error.
     */
    getInitialScope(client?: any): any;
}
