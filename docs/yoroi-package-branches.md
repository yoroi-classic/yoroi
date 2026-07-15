# Yoroi Package Branches

The `@yoroi/*` packages under `scripts/packages` can be consumed from GitHub without
publishing to npmjs, but the installable branch must have the package at the
repository root.

For example, this installs the root of a generated package branch:

```json
{
  "dependencies": {
    "@yoroi/logger": "git+ssh://git@github.com/yoroi-classic/yoroi.git#pkg/yoroi-logger"
  }
}
```

A normal branch of this monorepo is not enough for npm consumers because the
package manifest would still be nested at `scripts/packages/<package>/package.json`.
The generated package branch should contain the built package files at its root,
including `package.json`, `README.md`, and `lib`.

## Prepare a Branch Directory

Build and pack the package, then extract the installable contents:

```sh
node scripts/prepare-package-branch.js logger --out-dir /tmp/yoroi-logger-branch
```

The script runs:

- `npm ci --legacy-peer-deps` in `scripts/packages/logger`
- `npm run build:release` in `scripts/packages/logger`
- `npm pack --ignore-scripts`
- extraction of the packed package into the output directory

The generated `package.json` strips npm git-dependency build triggers such as
`build`, `prepare`, and `prepack`, plus npmjs publish aliases. That keeps
consumers from rebuilding the package every time they install the Git branch.

For local script validation with a package that is already built, use:

```sh
node scripts/prepare-package-branch.js logger \
  --out-dir /tmp/yoroi-logger-branch \
  --skip-install \
  --skip-build
```

## Publish the Branch

Publish from a temporary clone so the source worktree remains clean:

```sh
git clone git@github.com:yoroi-classic/yoroi.git /tmp/yoroi-logger-publish
cd /tmp/yoroi-logger-publish
git switch --orphan pkg/yoroi-logger
git rm -rf .
cp -R /tmp/yoroi-logger-branch/. .
git add -A
git -c commit.gpgsign=false commit --no-gpg-sign -m "Publish @yoroi/logger package branch"
git push origin pkg/yoroi-logger --force-with-lease
```

Use one branch per package, named `pkg/yoroi-<package>`, so downstream lockfiles
can clearly show which package branch they consume.

## Current Build Blockers

This tooling prepares the branch contents once a package can produce a normal
npm pack tarball. Several package roots still need follow-up build-stability
work before they are publishable as generated branches:

- `@yoroi/common`: `npm ci` fails because `scripts/packages/common/package-lock.json`
  is not in sync with `package.json`.
- `@yoroi/wallet-manager`: `npm run build:release` cannot resolve first-party
  `@yoroi/*` package entrypoints from its standalone package install.
- `@yoroi/logger`: `npm run build:release` reaches Jest, then fails because the
  standalone package install does not provide the configured `react-native`
  preset.
