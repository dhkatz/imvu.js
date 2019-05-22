export function authenticated(): MethodDecorator {
  return <T>(target: object, propertyKey: PropertyKey, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> => {
    const method = descriptor.value as any;

    descriptor.value = async function(...args: any[]) {
      if (!this.client.authenticated) {
        throw new Error('This action cannot be completed without user authentication! Please login.');
      }

      return method.apply(this, args);
    } as any;

    return descriptor;
  };
}
