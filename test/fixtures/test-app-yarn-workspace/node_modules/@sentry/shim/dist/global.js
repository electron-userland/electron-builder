"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
global.__SENTRY__ = global.__SENTRY__ || {
    shim: undefined,
    stack: [],
};
/** Returns the global shim registry. */
function getGlobalRegistry() {
    return global.__SENTRY__;
}
exports.getGlobalRegistry = getGlobalRegistry;
/** Returns the global stack of scope layers. */
function getGlobalStack() {
    return global.__SENTRY__.stack;
}
exports.getGlobalStack = getGlobalStack;
//# sourceMappingURL=global.js.map