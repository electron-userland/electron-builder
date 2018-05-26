import { Registry, ScopeLayer } from './interfaces';

/** A compatibility version for Node's "domain" module. */
let domain: {
  active?: {
    __SENTRY__?: Registry;
  };
};

try {
  // tslint:disable-next-line:no-var-requires
  domain = require('domain');
} catch {
  domain = {};
}

/** Checks for an active domain and returns its stack, if present. */
export function getDomainStack(): ScopeLayer[] | undefined {
  const active = domain.active;
  if (!active) {
    return undefined;
  }

  let registry = active.__SENTRY__;
  if (!registry) {
    active.__SENTRY__ = registry = { stack: [] };
  }

  return registry.stack;
}
