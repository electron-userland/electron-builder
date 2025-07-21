---
"builder-util-runtime": minor
---

fix: implement industry-standard cross-origin redirect auth handling

Replace hardcoded service-specific hostname checks with sophisticated cross-origin redirect detection that matches industry standards from Python requests library and Apache HttpClient.

**Key improvements:**
- **Case-insensitive hostname comparison** for robust origin detection
- **HTTP→HTTPS upgrade allowance** on standard ports (80→443) for backward compatibility
- **Proper default port handling** that treats implicit and explicit default ports as equivalent
- **Standards-compliant cross-origin detection** following RFC specifications

**Fixes GitHub issue #9207:** GitHub release asset downloads failing with 403 Forbidden when redirected from `api.github.com` to `release-assets.githubusercontent.com` (Azure backend) or other cloud storage services that don't accept GitHub tokens.

The implementation now handles all cross-origin redirect scenarios while maintaining compatibility with legitimate same-origin redirects and industry-standard HTTP→HTTPS upgrades.
