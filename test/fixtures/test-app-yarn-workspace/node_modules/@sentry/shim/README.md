<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry JavaScript SDK Shim

[![npm version](https://img.shields.io/npm/v/@sentry/shim.svg)](https://www.npmjs.com/package/@sentry/shim)
[![npm dm](https://img.shields.io/npm/dm/@sentry/shim.svg)](https://www.npmjs.com/package/@sentry/shim)
[![npm dt](https://img.shields.io/npm/dt/@sentry/shim.svg)](https://www.npmjs.com/package/@sentry/shim)

A lightweight Sentry SDK shim that uses a configured client when embedded into
an application. It allows library authors add support for a Sentry SDK without
having to bundle the entire SDK or being dependent on a specific platform.

## Usage

To use the shim, you do not have to initialize an SDK. This should be handled by
the user of your library. Instead, direcly use the exported functions of
`@sentry/shim` to add breadcrumbs or capture events:

```javascript
import * as Sentry from '@sentry/shim';

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

Note that while strictly possible, it is discouraged to interfer with the event
context. If for some reason your library needs to inject context information,
beware that this might override the user's context values:

```javascript
// Set user information, as well as tags and further extras
Sentry.setExtraContext({ battery: 0.7 });
Sentry.setTagsContext({ user_mode: 'admin' });
Sentry.setUserContext({ id: '4711' });
```
