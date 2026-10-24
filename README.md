# @imvu/

[![Build Packages](https://github.com/dhkatz/imvu.js/actions/workflows/build.yml/badge.svg)](https://github.com/dhkatz/imvu.js/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/dhkatz/imvu.js/badge.svg?branch=master)](https://coveralls.io/github/dhkatz/imvu.js?branch=master)

A JavaScript/TypeScript library for interacting with the IMVU API.

This library allows easy usage to the exposed API endpoints on IMVU's current _IMVU Next_ implementation,
as well as several legacy web endpoints.

Despite what IMVU's own `imvu.js` library claims, they are not using standard JavaScript practices. This collection
of libraries is intended to be a more modern, more complete, and more correct implementation of the IMVU API.

## Installation

`npm install @imvu/client`

## Information

### Packages

The `@imvu` mono-repository contains the following packages. The
[documentation site](https://dhkatz.github.io/imvu.js/) covers each one.

| Package        | What it is                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `@imvu/client` | The modeled API: users, the account, wishlists, gifts, rooms and chat, IMs.    |
| `@imvu/bot`    | Chat bots across many rooms and IMs: commands, permissions, rate limits.       |
| `@imvu/verify` | Stateless proofs that someone owns an IMVU account (a code in their tagline).  |
| `@imvu/rest`   | The low-level REST client: authentication, sessions, raw API documents.        |
| `@imvu/imq`    | IMVU's IMQ realtime websocket service (queues, mounts).                        |
| `@imvu/xmlrpc` | The classic client's XML-RPC gateway (e.g. current product revisions).         |
| `@imvu/cal3d`  | Read and write the Cal3D model files products are made of.                     |
| `@imvu/chkn`   | Load products: CFL/CHKN archives and `index.xml` templates. Not published yet. |
| `@imvu/tools`  | Command-line tools for working with products. Not published.                   |

### Testing

The default test suite is offline and never contacts IMVU:

```sh
npm test
npm run test:typecheck
```

Live read-only integration tests require `IMVU_RUN_LIVE_TESTS=true` plus the
`IMVU_USERNAME` and `IMVU_PASSWORD` environment variables. State-changing tests are
separately gated behind `IMVU_RUN_MUTATION_TESTS=true`; use a dedicated test account
if you deliberately enable them.

### Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) and
the `Release` workflow:

1. Every change to a published package includes a changeset (`npx changeset`), saying
   which packages it affects and how (patch, minor or major).
2. On every push to `master`, the workflow runs the checks. If there are pending
   changesets, it opens or updates a **"chore: version packages"** pull request that
   bumps versions and writes the changelogs.
3. **Merging that pull request publishes** the new versions to npm (with provenance),
   tags them, and creates GitHub releases.

One-time setup:

- **Allow the workflow to open pull requests:** repository Settings → Actions →
  General → Workflow permissions → _Allow GitHub Actions to create and approve pull
  requests_.
- **Trusted publishing:** the workflow publishes with npm trusted publishing (OIDC),
  so no npm token is stored. Each package needs a trusted publisher on npmjs.com:
  the package → Settings → _Trusted Publisher_ → GitHub Actions, with repository
  `dhkatz/imvu.js` and workflow `release.yml`.
- **A new package** can't have a trusted publisher until it exists on npm, so its
  first version has to be published another way. Either publish it once from your
  machine (`npm publish` in its folder), or temporarily give the publish step a
  token: add `registry-url: 'https://registry.npmjs.org'` to `setup-node` and
  `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the publish step's environment.
  Then add the trusted publisher and remove the token.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
