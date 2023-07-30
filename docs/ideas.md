# Ideas

These are some ideas for improving the project. If you have any ideas, feel free to open an issue or pull request.

## Refactors

Ideas in this category would be large refactors that would change the way the project works.

### Pseudo-class Based Approach

Currently, all resources in the project are defined as classes, which is easy to understand, but very verbose to write,
especially with all the decorators and relations which need to be implemented.

This current approach looks like this:

```typescript
import {JsonProperty} from 'typescript-json-serializer';

class Resource {
    // ... base resource properties
}

class User extends Resource {
    @JsonProperty()
    public name: string;
    
    @JsonProperty()
    public email: string;
    
    @JsonProperty()
    public avatar: string;

    // ... user properties
    
    public async* products() {
        // ... yield products
    }
}
```

This approach could be changed to a pseudo-class based approach, where instead we create the class dynamically based
on its properties and relations. This would look something like this:

```typescript
import {createModel} from './model';

const User = createModel(
    {
        name: 'string',
        email: 'string',
        avatar: 'string',
    }, 
    {
        products: {
            type: 'paginated',
            resource: () => Product,
        }
    }
);
```

The issue with this approach right now is that it is *very hard* to create a type-safe approach to this. The current
approach is type-safe, but very verbose. We need to investigate if there is a way to make this approach type-safe.

I am leaving a basic implementation of this here for reference:

```typescript
export type Constructor<T, Arguments extends unknown[] = any[]> = new (
	...arguments_: Arguments
) => T;

export type TypeOrReturnType<T> = T extends (...args: any[]) => infer R ? R : T;
export type TypeOrInstanceType<T> = T extends new (...args: any[]) => infer R ? R : T;

export type ResourceStringProperty = {
	type: 'string';
	fallback?: string;
};

export type ResourceNumberProperty = {
	type: 'number';
	fallback?: number;
};

export type ResourceBooleanProperty = {
	type: 'boolean';
	fallback?: boolean;
};

export type ResourceDateProperty = {
	type: 'date';
	fallback?: Date | string | number;
};

export type ResourceProperty =
	| ResourceStringProperty
	| ResourceNumberProperty
	| ResourceBooleanProperty
	| ResourceDateProperty;

export type ResourceProperties = Record<string, ResourceProperty>;

export abstract class Resource {
	protected constructor(public client: Client) {}

	public get id(): string {
		return '';
	}
}

class Client {
	async resource<T extends Resource>(url: string, cls: Constructor<T>): Promise<T> {
		return new cls(this, {
			data: {
				name: 'test',
			},
		});
	}
}

export type ResourceBasicRelation<T> = {
	type: 'basic';
	name?: string;
	resource: T | (() => T);
};

export type ResourcePaginatedRelation<T> = {
	type: 'paginated';
	name?: string;
	resource: T | (() => T);
};

export type ResourceRelation<T extends Resource> =
	| ResourceBasicRelation<T>
	| ResourcePaginatedRelation<T>;

export type ResourceRelations = Record<string, ResourceRelation<any>>;

export type ResourcePropertiesToObjectType<TProperties extends ResourceProperties> = {
	[K in keyof TProperties]: NonNullable<TProperties[K]['fallback']>;
};

export type ResourceRelationsToObjectType<TRelations extends ResourceRelations> = {
	[K in keyof TRelations]: TRelations[K] extends ResourceBasicRelation<infer T>
		? () => Promise<TypeOrInstanceType<T>>
		: TRelations[K] extends ResourcePaginatedRelation<infer T>
		? () => AsyncIterableIterator<TypeOrInstanceType<T>>
		: never;
};

export type ResourcePropertiesOrStringToResourceProperties<
	TProperties extends Record<keyof TProperties, ResourceProperty | ResourceProperty['type']>
> = {
	[K in keyof TProperties]: TProperties[K] extends ResourceProperty
		? TProperties[K]
		: Extract<ResourceProperty, { type: TProperties[K] }>;
};

export type ResourceConstructorOptions<
	TProperties extends ResourceProperties,
	TRelations extends ResourceRelations
> = {
	data: ResourcePropertiesToObjectType<TProperties>;
	relations: Record<keyof TRelations, string>;
};

export type ResourceConstructor<
	TProperties extends ResourceProperties,
	TRelations extends ResourceRelations
> = Constructor<
	ResourcePropertiesToObjectType<TProperties> & ResourceRelationsToObjectType<TRelations>,
	[client: Client, resource: ResourceConstructorOptions<TProperties, TRelations>]
>;

export function createModel<
	TProperties extends Record<keyof TProperties, ResourceProperty | ResourceProperty['type']>,
	TRelations extends { [K in keyof TRelations]: ResourceRelation<any> },
	RProperties extends Record<
		keyof TProperties,
		ResourceProperty
	> = ResourcePropertiesOrStringToResourceProperties<TProperties>
>(properties: TProperties, relations?: TRelations): ResourceConstructor<RProperties, TRelations> {
	const DerivedResource = class DerivedResource extends Resource {
		protected data: ResourcePropertiesToObjectType<RProperties> = {} as any;
		protected relations: Record<keyof TRelations, string> = {} as any;

		public constructor(
			client: Client,
			resource: ResourceConstructorOptions<RProperties, TRelations>
		) {
			super(client);

			this.data = resource.data;
			this.relations = resource.relations;

			for (const [key, value] of Object.entries<ResourceProperty | string>(properties)) {
				Object.defineProperty(this, key, {
					value:
						resource.data[key as keyof typeof resource.data] ??
						(typeof value !== 'string' && value.fallback),
				});
			}
		}
	};

	if (relations) {
		for (const [key, value] of Object.entries<ResourceRelation<any>>(relations)) {
			if (value.type === 'basic') {
				Object.defineProperty(DerivedResource.prototype, key, {
					value: async function () {
						if (this.relations && key in this.relations) {
							return this.client.resource(
								this.relations[key],
								typeof value.resource === 'function' ? value.resource() : value.resource
							);
						}
					},
				});
			} else {
				Object.defineProperty(DerivedResource.prototype, key, {
					value: async function* () {
						if (this.relations && key in this.relations) {
							// yield* new URLPaginator(this.client, value.resource, this.relations[key]);
						}
					},
				});
			}
		}
	}

	return DerivedResource as any;
}
```
