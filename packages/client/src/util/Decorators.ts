import type { Resource } from '../resources';
import type { BaseManager } from '../managers';

type Parameters<T> = T extends (...args: infer U) => unknown ? U : never;

export function authenticated() {
  return <T, U extends Resource | BaseManager>(
    target: U,
    propertyKey: PropertyKey,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> => {
    if (!(descriptor.value instanceof Function)) {
      throw new Error('Cannot wrap non-function property in authentication check!');
    }

    const method = descriptor.value;

    const run = function (this: U, ...args: Parameters<T>) {
      if (!this.client.authenticated) {
        throw new Error(
          'This action cannot be completed without user authentication! Please login.'
        );
      }

      return method.apply(this, args);
    };

    descriptor.value = function (this: U, ...args: Parameters<T>) {
      return run.apply(this, args);
    } as unknown as T;

    return descriptor;
  };
}
