# Changes

## 2026-09-09 candidate

- Setup and packages: build the renderer before demo startup, document both
  installs, verify isolated tarball consumers and repair NodeNext declarations.
- Viewer: preserve all composition source identities, show loading failures
  with retry, expose scenario selection, fix mobile labels/dark highlights and
  composition text contrast, and keep hidden panels from crashing.
- Verification: replace the custom CDP gate with bounded Playwright ownership,
  responsive interaction/axe evidence and clean-install CI on Windows/Linux.
  Preserve the MCP event-log route while protecting private local files.
- Dependencies: repair the vulnerable Vitest/PostCSS/nanoid development chains.
  Runtime dependency versions stay unchanged.

See [the handoff](docs/PACKAGE_VIEWER_HANDOFF.md) for reproducible commands and
the limits of the evidence. This entry does not mean the packages were published.
