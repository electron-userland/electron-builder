import { Breadcrumb, SentryEvent, User } from './models';
/**
 * Create a new scope to store context information.
 *
 * The scope will be layered on top of the current one. It is isolated, i.e. all
 * breadcrumbs and context information added to this scope will be removed once
 * the scope ends. Be sure to always remove this scope with {@link popScope}
 * when the operation finishes or throws.
 */
export declare function pushScope(client?: any): void;
/**
 * Removes a previously pushed scope from the stack.
 *
 * This restores the state before the scope was pushed. All breadcrumbs and
 * context information added since the last call to {@link pushScope} are
 * discarded.
 */
export declare function popScope(): void;
/**
 * Creates a new scope and executes the given operation within. The scope is
 * automatically removed once the operation finishes or throws.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope();
 *     callback();
 *     popScope();
 *
 * @param callback The operation to execute.
 */
export declare function withScope(callback: () => void): void;
/**
 * Creates a new scope with a custom client instance and executes the given
 * operation within. The scope is automatically removed once the operation
 * finishes or throws.
 *
 * The client can be configured with different options than the enclosing scope,
 * such as a different DSN or other callbacks.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope(client);
 *     callback();
 *     popScope();
 *
 * @param client A client to use within the scope.
 * @param callback The operation to execute.
 */
export declare function withScope(client: any, callback: () => void): void;
/** Clears the current scope and resets it to the initalScope. */
export declare function clearScope(): void;
/** Returns the current client, if any. */
export declare function getCurrentClient(): any | undefined;
/**
 * This binds the given client to the current scope.
 * @param client An SDK client (frontend) instance.
 */
export declare function bindClient(client: any): void;
/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * @param callback A callback that is invoked when the exception has been sent.
 */
export declare function captureException(exception: any, callback?: (error?: any) => void): void;
/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * @param callback A callback that is invoked when the message has been sent.
 */
export declare function captureMessage(message: string, callback?: (error?: any) => void): void;
/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 * @param callback A callback that is invoked when the event has been sent.
 */
export declare function captureEvent(event: SentryEvent, callback?: (error?: any) => void): void;
/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export declare function addBreadcrumb(breadcrumb: Breadcrumb): void;
/**
 * Updates user context information for future events.
 * @param extra User context object to merge into current context.
 */
export declare function setUserContext(user: User): void;
/**
 * Updates tags context information for future events.
 * @param extra Tags context object to merge into current context.
 */
export declare function setTagsContext(tags: {
    [key: string]: string;
}): void;
/**
 * Updates extra context information for future events.
 * @param extra Extra context object to merge into current context.
 */
export declare function setExtraContext(extra: object): void;
/**
 * Calls a function on the latest client. Use this with caution, it's meant as
 * in "internal" helper so we don't need to expose every possible function in
 * the shim. It is not guaranteed that the client actually implements the
 * function.
 *
 * @param method The method to call on the client/frontend.
 * @param args Arguments to pass to the client/fontend.
 */
export declare function _callOnClient(method: string, ...args: any[]): void;
