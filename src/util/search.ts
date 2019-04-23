import { memoize } from './memoize';

function search<T, K extends keyof T>(json: T, key: K): T[K] | undefined {
  for (const [k, v] of Object.entries(json)) {
    if (k === key) {
      return v;
    } else if (typeof v === 'object') {
      return search(v, key);
    }
  }

  return undefined;
}

const memoizedSearch = memoize(search);

export { memoizedSearch as search };
