"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
Object.defineProperty(exports, "__esModule", { value: true });
var error_1 = require("./error");
/** Regular expression used to parse a DSN. */
var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w\.-]+)(?::(\d+))?\/(.+)/;
/** The Sentry DSN, identifying a Sentry instance and project. */
var DSN = /** @class */ (function () {
    /** Creates a new DSN component */
    function DSN(from) {
        if (typeof from === 'string') {
            this.fromString(from);
        }
        else {
            this.fromComponents(from);
        }
        this.validate();
    }
    /**
     * Renders the string representation of this DSN.
     *
     * By default, this will render the public representation without the password
     * component. To get the deprecated private representation, set `withPassword`
     * to true.
     *
     * @param withPassword When set to true, the password will be included.
     */
    DSN.prototype.toString = function (withPassword) {
        if (withPassword === void 0) { withPassword = false; }
        // tslint:disable-next-line:no-this-assignment
        var _a = this, host = _a.host, path = _a.path, pass = _a.pass, port = _a.port, protocol = _a.protocol, user = _a.user;
        return (protocol + "://" + user + (withPassword && pass ? ":" + pass : '') +
            ("@" + host + (port ? ":" + port : '') + "/" + path));
    };
    /** Parses a string into this DSN. */
    DSN.prototype.fromString = function (str) {
        var match = DSN_REGEX.exec(str);
        if (!match) {
            throw new error_1.SentryError('Invalid DSN');
        }
        var _a = __read(match.slice(1), 6), protocol = _a[0], user = _a[1], _b = _a[2], pass = _b === void 0 ? '' : _b, host = _a[3], _c = _a[4], port = _c === void 0 ? '' : _c, path = _a[5];
        Object.assign(this, { host: host, pass: pass, path: path, port: port, protocol: protocol, user: user });
    };
    /** Maps DSN components into this instance. */
    DSN.prototype.fromComponents = function (components) {
        this.protocol = components.protocol;
        this.user = components.user;
        this.pass = components.pass || '';
        this.host = components.host;
        this.port = components.port || '';
        this.path = components.path;
    };
    /** Validates this DSN and throws on error. */
    DSN.prototype.validate = function () {
        try {
            for (var _a = __values(['protocol', 'user', 'host', 'path']), _b = _a.next(); !_b.done; _b = _a.next()) {
                var component = _b.value;
                if (!this[component]) {
                    throw new error_1.SentryError("Invalid DSN: Missing " + component);
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (this.protocol !== 'http' && this.protocol !== 'https') {
            throw new error_1.SentryError("Invalid DSN: Unsupported protocol \"" + this.protocol + "\"");
        }
        if (this.port && isNaN(parseInt(this.port, 10))) {
            throw new error_1.SentryError("Invalid DSN: Invalid port number \"" + this.port + "\"");
        }
        var e_1, _c;
    };
    return DSN;
}());
exports.DSN = DSN;
//# sourceMappingURL=dsn.js.map