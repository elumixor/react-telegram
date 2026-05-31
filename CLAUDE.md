# react-telegram

Streams React JSX into editable Telegram messages. Built on `@elumixor/react-message-renderer` + grammY.

## Releasing / publishing

Publishing is **automated by CI** — do not run `npm publish` locally (the local npm token is often unauthenticated; CI uses its own with provenance).

To cut a release:

```bash
npm run release:patch   # or release:minor / release:major
```

This bumps the version, commits `Release vX.Y.Z`, tags `vX.Y.Z`, and pushes the tag. The `publish` job in `.github/workflows/build.yml` triggers on any `v*` tag push and runs `npm publish --access public --provenance` after build/test/lint pass.

Gotchas:
- `release:*` only runs `git push --tags`, not `git push`. Run `git push` too so the version-bump commit lands on the remote branch.
- After pushing, verify the run: `gh run list -R elumixor/react-telegram --workflow build.yml`, then `npm view @elumixor/react-telegram version`.

## Releasing alongside react-message-renderer

This package depends on `@elumixor/react-message-renderer`. When a release bumps that dependency to a not-yet-published version:

1. **Release `react-message-renderer` first** and wait until the new version is resolvable on npm (`npm view @elumixor/react-message-renderer version`).
2. Only then release this package.

If you release them too close together, this package's CI `bun install` fails with `No version matching "^X.Y.Z" found (but package exists)` — a propagation race. Fix: once the dependency is live, **re-run the failed workflow** instead of bumping again:

```bash
gh run rerun <run-id> -R elumixor/react-telegram
```

The existing `vX.Y.Z` tag already points at the right commit, so no version re-bump is needed.
