export function memoize<T extends CallableFunction>(fn: T) {
  const cache: Record<string, any> = {};

  return ((...args: any[]) => {
    const stringifiedArgs = JSON.stringify(args);
    const result = cache[stringifiedArgs] = cache[stringifiedArgs] || fn(...args);
    return result;
  }) as unknown as T;
}
