// The API wire types now live in @imvu/rest (the low-level layer). Re-exported
// here so the client's `../types` imports keep resolving.
export * from '@imvu/rest';

/** Any class whose instances are `T`. */
export type Constructor<T> = new (...args: any[]) => T;
