export type ResourceId = string;

export interface APIErrorResponse {
	status: 'failure';
	error: string;
	message: string;
}

/** The IMQ target advertised by a REST document's `updates` member. */
export interface APIUpdateTarget {
	queue: `inv:${string}` | `private:${string}` | `/${string}`;
	mount: 'node' | `edge:${string}`;
}

/** @deprecated Use {@link APIUpdateTarget}. */
export type APIMount = APIUpdateTarget;

export interface APIRelations {
	[relation: string]: string;
}

/** Raw node/edge document as it appears inside the denormalized wire envelope. */
export interface APIResourceNode<T extends object = Record<string, any>> {
	data: T & { id?: string | number; _id?: string | number };
	relations: APIRelations | null;
	updates: Partial<APIUpdateTarget> | null;
}

/** Raw node-group/edge-group document as it appears inside the wire envelope. */
export interface APICollectionNode<T extends object = Record<string, any>> {
	data: { items: string[]; total_count: number } & T;
	relations: APIRelations | null;
	updates: Partial<APIUpdateTarget> | null;
}

/** A normalized, individually addressable REST resource. */
export interface APIResource<T extends object = Record<string, any>> {
	/** Canonical denormalized key/URL. This, rather than `id`, is the cache identity. */
	url: string;
	id: ResourceId;
	data: T;
	relations: APIRelations;
	updates: APIUpdateTarget | null;
}

/** A normalized, bounded page from a REST collection. */
export interface APICollection<T extends object = Record<string, any>> {
	url: string;
	data: T;
	itemUrls: string[];
	/** Each item resolved through its edge's `ref` (e.g. the products on a wishlist). */
	items: APIResource[];
	/**
	 * The edge documents themselves, for collections whose edges carry their own data
	 * (e.g. chat participants: seat, outfit, join time, with `ref` → the user).
	 */
	edges?: APIResource[];
	totalCount: number;
	relations: APIRelations;
	updates: APIUpdateTarget | null;
}

export type APIResourceStatusError = {
	status: 'failure';
	error: string;
	message: string;
};

export interface APIResourceStatusMeta {
	error_response?: APIErrorResponse;
}

export interface APIResourceStatus {
	status: number;
	headers: Record<string, string>;
	meta: [] | APIResourceStatusMeta;
}

export interface APISuccessResponse<T extends object = Record<string, any>> {
	status: 'success';
	id: string;
	denormalized: Record<string, APIResourceNode<T> | APICollectionNode>;
	http: Record<string, APIResourceStatus>;
}

export type APIResponse<T extends object = Record<string, any>> = APIErrorResponse | APISuccessResponse<T>;

export type DateMapped<T extends Record<string, any>> = {
	[K in keyof T]: K extends `${string}_datetime` ? Date : T[K] extends object ? DateMapped<T[K]> : T[K];
};
