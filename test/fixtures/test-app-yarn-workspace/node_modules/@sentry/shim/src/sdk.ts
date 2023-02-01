import { getGlobalRegistry } from './global';
import { Breadcrumb, SentryEvent, User } from './models';
import { API_VERSION, Shim } from './shim';

/** Default callback used for catching async errors. */
function logError(e?: any): void {
  if (e) {
    console.error(e);
  }
}

/**
 * Internal helper function to call a method on the top client if it exists.
 *
 * @param method The method to call on the client/frontend.
 * @param args Arguments to pass to the client/fontend.
 */
function invokeClient(method: string, ...args: any[]): void {
  const top = getOrCreateShim().getStackTop();
  if (top && top.client && top.client[method]) {
    top.client[method](...args, top.scope);
  }
}

/**
 * Internal helper function to call an async method on the top client if it
 * exists.
 *
 * @param method The method to call on the client/frontend.
 * @param callback A callback called with the error or success return value.
 * @param args Arguments to pass to the client/fontend.
 */
function invokeClientAsync<T>(
  method: string,
  callback: (error?: any, value?: T) => void,
  ...args: any[]
): void {
  const top = getOrCreateShim().getStackTop();
  if (top && top.client && top.client[method]) {
    top.client[method](...args, top.scope)
      .then((value: T) => {
        callback(undefined, value);
      })
      .catch((err: any) => {
        callback(err);
      });
  }
}

/**
 * Returns the latest shim instance.
 *
 * If a shim is already registered in the global registry but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered shim will be returned.
 */
function getOrCreateShim(): Shim {
  const registry = getGlobalRegistry();

  if (!registry.shim || registry.shim.isOlderThan(API_VERSION)) {
    registry.shim = new Shim();
  }

  return registry.shim;
}

/**
 * Create a new scope to store context information.
 *
 * The scope will be layered on top of the current one. It is isolated, i.e. all
 * breadcrumbs and context information added to this scope will be removed once
 * the scope ends. Be sure to always remove this scope with {@link popScope}
 * when the operation finishes or throws.
 */
export function pushScope(client?: any): void {
  getOrCreateShim().pushScope(client);
}

/**
 * Removes a previously pushed scope from the stack.
 *
 * This restores the state before the scope was pushed. All breadcrumbs and
 * context information added since the last call to {@link pushScope} are
 * discarded.
 */
export function popScope(): void {
  getOrCreateShim().popScope();
}

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
export function withScope(callback: () => void): void;

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
export function withScope(client: any, callback: () => void): void;

export function withScope(arg1: any, arg2?: any): void {
  getOrCreateShim().withScope(arg1, arg2);
}

/** Clears the current scope and resets it to the initalScope. */
export function clearScope(): void {
  getOrCreateShim().clearScope();
}

/** Returns the current client, if any. */
export function getCurrentClient(): any | undefined {
  return getOrCreateShim().getCurrentClient();
}

/**
 * This binds the given client to the current scope.
 * @param client An SDK client (frontend) instance.
 */
export function bindClient(client: any): void {
  const shim = getOrCreateShim();
  const top = shim.getStackTop();
  top.client = client;
  top.scope = shim.getInitialScope(client);
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * @param callback A callback that is invoked when the exception has been sent.
 */
export function captureException(
  exception: any,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureException', callback, exception);
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * @param callback A callback that is invoked when the message has been sent.
 */
export function captureMessage(
  message: string,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureMessage', callback, message);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 * @param callback A callback that is invoked when the event has been sent.
 */
export function captureEvent(
  event: SentryEvent,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureEvent', callback, event);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  invokeClient('addBreadcrumb', breadcrumb);
}

/**
 * Updates user context information for future events.
 * @param extra User context object to merge into current context.
 */
export function setUserContext(user: User): void {
  invokeClient('setContext', { user });
}

/**
 * Updates tags context information for future events.
 * @param extra Tags context object to merge into current context.
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  invokeClient('setContext', { tags });
}

/**
 * Updates extra context information for future events.
 * @param extra Extra context object to merge into current context.
 */
export function setExtraContext(extra: object): void {
  invokeClient('setContext', { extra });
}

/**
 * Calls a function on the latest client. Use this with caution, it's meant as
 * in "internal" helper so we don't need to expose every possible function in
 * the shim. It is not guaranteed that the client actually implements the
 * function.
 *
 * @param method The method to call on the client/frontend.
 * @param args Arguments to pass to the client/fontend.
 */
export function _callOnClient(method: string, ...args: any[]): void {
  invokeClient(method, ...args);
}
