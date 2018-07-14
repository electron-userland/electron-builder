"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** A compatibility version for Node's "domain" module. */
var domain;
try {
    // tslint:disable-next-line:no-var-requires
    domain = require('domain');
}
catch (_a) {
    domain = {};
}
/** Checks for an active domain and returns its stack, if present. */
function getDomainStack() {
    var active = domain.active;
    if (!active) {
        return undefined;
    }
    var registry = active.__SENTRY__;
    if (!registry) {
        active.__SENTRY__ = registry = { stack: [] };
    }
    return registry.stack;
}
exports.getDomainStack = getDomainStack;
//# sourceMappingURL=domain.js.map