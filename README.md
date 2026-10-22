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

The `@imvu` mono-repository contains the following packages:

- `@imvu/client`: The client library for interacting with the IMVU API. (log in, gifting, messaging, etc.)
- `@imvu/imq`: Library for interacting with the IMVU IMQ websocket server (chat, notifications, etc).
- `@imvu/chkn`: Load products (CFL/CHKN archives, `index.xml` templates with inheritance), assemble their models, and export or flatten CHKN files.
- `@imvu/cal3d`: Read and write the Cal3D model files products are made of (skeletons, meshes, materials, animations).
- `@imvu/studio`: Library for interacting with IMVU Studio services (product publishing, editing, etc).
- `@imvu/tools`: A collection of tools for interacting with IMVU's API (product downloading, etc).

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
