export function hasProp<K extends PropertyKey>(obj: unknown, prop: K): obj is Record<K, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  return prop in obj;
}

export function hasProps<K extends PropertyKey>(
  obj: unknown,
  props: K[]
): obj is Record<K, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  for (const prop of props) {
    if (!hasProp(obj, prop)) {
      return false;
    }
  }

  return true;
}
