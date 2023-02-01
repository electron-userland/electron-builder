"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** The status of an event. */
var SendStatus;
(function (SendStatus) {
    /** The status could not be determined. */
    SendStatus["Unknown"] = "unknown";
    /** The event was skipped due to configuration or callbacks. */
    SendStatus["Skipped"] = "skipped";
    /** The event was sent to Sentry successfully. */
    SendStatus["Success"] = "success";
    /** The client is currently rate limited and will try again later. */
    SendStatus["RateLimit"] = "rate_limit";
    /** The event could not be processed. */
    SendStatus["Invalid"] = "invalid";
    /** A server-side error ocurred during submission. */
    SendStatus["Failed"] = "failed";
})(SendStatus = exports.SendStatus || (exports.SendStatus = {}));
// tslint:disable:no-unnecessary-qualifier no-namespace
(function (SendStatus) {
    /**
     * Converts a HTTP status code into a {@link SendStatus}.
     *
     * @param code The HTTP response status code.
     * @returns The send status or {@link SendStatus.Unknown}.
     */
    function fromHttpCode(code) {
        if (code >= 200 && code < 300) {
            return SendStatus.Success;
        }
        if (code === 429) {
            return SendStatus.RateLimit;
        }
        if (code >= 400 && code < 500) {
            return SendStatus.Invalid;
        }
        if (code >= 500) {
            return SendStatus.Failed;
        }
        return SendStatus.Unknown;
    }
    SendStatus.fromHttpCode = fromHttpCode;
})(SendStatus = exports.SendStatus || (exports.SendStatus = {}));
//# sourceMappingURL=status.js.map