import { Registry, ScopeLayer } from './interfaces';

/** Global interface helper for type safety. */
interface Global {
  __SENTRY__: Registry;
}

declare var global: Global;

global.__SENTRY__ = global.__SENTRY__ || {
  shim: undefined,
  stack: [],
};

/** Returns the global shim registry. */
export function getGlobalRegistry(): Registry {
  return global.__SENTRY__;
}

/** Returns the global stack of scope layers. */
export function getGlobalStack(): ScopeLayer[] {
  return global.__SENTRY__.stack;
}
