# @imvu.js

[![Build Status](https://travis-ci.com/dhkatz/imvu.js.svg?branch=master)](https://travis-ci.com/dhkatz/imvu.js) 
[![Coverage Status](https://coveralls.io/repos/github/dhkatz/imvu.js/badge.svg?branch=master)](https://coveralls.io/github/dhkatz/imvu.js?branch=master)

A JavaScript/TypeScript library for interacting with the IMVU API.

This library allows easy usage to the exposed API endpoints on IMVU's current *IMVU Next* implementation,
as well as several legacy web endpoints.

## Installation

`npm install dhkatz/imvu.js`

## Information

### Packages

The `@imvu` mono-repository contains the following packages:

- `@imvu/client`: The client library for interacting with the IMVU API. (log in, gifting, messaging, etc.)
- `@imvu/imq`: Library for interacting with the IMVU IMQ websocket server (chat, notifications, etc).
- `@imvu/chkn`: Download, extract, and create product CHKN files.
- `@imvu/studio`: Library for interacting with IMVU Studio services (product publishing, editing, etc).

### Caching

In order to reduce load on the IMVU API, this library implements request caching by default. The TTL varies by
resource, but is generally between 1 and 5 minutes. Some resources

### Testing

This library has testing in place to ensure the integrity and reliability of the APIs being used.

If you would like to run the tests, I recommend using a VPN and separate account to avoid potential 
rate limiting and IP issues.

Please set the `IMVU_USERNAME` and `IMVU_PASSWORD` environment variables to your IMVU account credentials.
Do not use your main account, as the tests may modify your account.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
