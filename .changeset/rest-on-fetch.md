---
'@imvu/rest': minor
'@imvu/client': minor
---

`@imvu/rest` now runs on the standard `fetch` instead of axios, and drops `axios`, `axios-cookiejar-support` and `tough-cookie-file-store` (`tough-cookie` remains). Existing `cookies.json` session files are migrated automatically.

**Breaking changes**

- `REST.http` (the axios instance) and `Client.http` are removed. Use `rest.request()` / `client.request()` for API calls, or `rest.fetch()` for a raw `Response`.
- Request options are now `RequestOptions` (`method`, `params`, `data`, `headers`, `signal`, `baseURL`) rather than `AxiosRequestConfig`.
- `REST.cookies` is now an async method, `cookies(): Promise<CookieJar>`.
- `RESTOptions` gains `cookieStorage` (pluggable persistence; `null` for memory-only) and `fetch` (a custom `fetch` implementation).
- Non-JSON responses now throw instead of being returned as-is. `follow`/`unfollow`, `friends.add`/`remove` and `roulette.spin` now see API rejections: the boolean methods return `false`, and `spin` throws `IMVUAPIError`. Previously these failures were silently ignored.
