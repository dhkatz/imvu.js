## imvu.js

[![Build Status](https://travis-ci.com/dhkatz/imvu.js.svg?branch=master)](https://travis-ci.com/dhkatz/imvu.js) [![Coverage Status](https://coveralls.io/repos/github/dhkatz/imvu.js/badge.svg?branch=master)](https://coveralls.io/github/dhkatz/imvu.js?branch=master)

> A JavaScript/TypeScript library for interacting with the IMVU web API.

## Description

This library allows easy usage to the exposed API endpoints on IMVU's current *IMVU Next* implementation, as well as several legacy web endpoints.

## Installation

`npm install imvu.js`

## Information

### Caching

In order to reduce load on IMVU's API, this library implements request caching by default. The amount of time resources are cached for for each resource are listed below.

| Resource | Hash           | TTL         |
|----------|----------------|-------------|
| User     | JSON.stringify | 1 minute(s) |
| Product  | JSON.stringify | 5 minute(s) |

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
