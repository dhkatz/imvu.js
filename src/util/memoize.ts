export interface MemoizeOptions {
  /** A custom function which returns a value used for hash lookup purposes. */
  hash?: (...args: any) => any;
  /** Cache expiration time. (Default: `-1`) */
  ttl?: number;
  /** Apply decorated method directly to class prototpe (useful for dynamic classes). (Default: `false`) */
  prototype?: boolean;
}

// eslint-disable-next-line
export function Memoize(options: MemoizeOptions | ((...args: any) => any) = {}) {
  return (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => {
    descriptor = descriptor === undefined ? Object.getOwnPropertyDescriptor(target, propertyKey) : descriptor;
    if (descriptor.value) {
      const method = getNewFunction(descriptor.value, typeof options === 'function' ? { hash: options } : options);
      descriptor.value = method;

      if (options.prototype) {
        target[propertyKey] = method;
      }
    } else if (descriptor.get) {
      const method = getNewFunction(descriptor.get, typeof options === 'function' ? { hash: options } : options);
      descriptor.get = method;

      if (options.prototype) {
        target[propertyKey] = method;
      }
    } else {
      throw new Error('Only put a Memoize() decorator on a method or get accessor.');
    }

    return descriptor;
  };
}

let counter = 0;
function getNewFunction(method: (...args: any) => any, options: MemoizeOptions): (...args: any) => any {
  const identifier = ++counter;

  // The function returned here gets called instead of originalMethod.
  return function(...args: any[]) {
    const propValName = `__memoized_value_${identifier}`;
    const propMapName = `__memoized_map_${identifier}`;

    let value: any;

    if (options.hash || args.length > 0) {

      // Get or create map
      if (!this.hasOwnProperty(propMapName)) {
        Object.defineProperty(this, propMapName, {
          configurable: false,
          enumerable: false,
          value: new Map<any, any>(),
          writable: false,
        });
      }
      const map: Map<any, any> = this[propMapName];
      const hash = options.hash ? options.hash.apply(this, args) : args[0];

      if (map.has(hash)) {
        value = map.get(hash);
      } else {
        value = method.apply(this, args);
        map.set(hash, value);

        if (options.ttl) {
          setTimeout(() => {
            map.delete(hash);
          }, options.ttl);
        }
      }

    } else {

      if (this.hasOwnProperty(propValName)) {
        value = this[propValName];
      } else {
        value = method.apply(this, args);
        Object.defineProperty(this, propValName, {
          configurable: false,
          enumerable: false,
          value,
          writable: false,
        });
      }
    }

    return value;
  };
}

export function memoize<T extends (...args: any) => any>(func: T, options: { ttl?: number} = {}): T {
  const cache = new Map<any, ReturnType<T>>();

  return ((...args: any): ReturnType<T> => {
    const hash = JSON.stringify(args);

    if (cache.has(hash)) {
      return cache.get(hash);
    } else {
      const value = func(...args);
      cache.set(hash, value);

      if (options.ttl) {
        setTimeout(() => {
          cache.delete(hash);
        }, options.ttl);
      }

      return value;
    }
  }) as T;
}
