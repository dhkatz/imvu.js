export interface APIErrorResponse {
	status: 'failure';
	error: string;
	message: string;
}

export interface APIMount {
	queue: `inv:${string}` | `private:${string}` | `/${string}`;
	mount: 'node' | `edge:${string}`;
}

export interface APIRelations {
	[relation: string]: string;
}

export interface APIResource<T extends object = Record<string, any>> {
	data: T & { id?: string };
	relations: APIRelations | null;
	updates: Record<string, APIMount> | null;
}

export interface APICollection<T extends object = Record<string, any>> {
	data: { items: string[]; total_count: number } & T;
	relations: APIRelations | null;
	updates: Record<string, APIMount> | null;
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
	denormalized: Record<string, APIResource<T> | APICollection>;
	http: Record<string, APIResourceStatus>;
}

export type APIResponse<T extends object = Record<string, any>> =
	| APIErrorResponse
	| APISuccessResponse<T>;

export type DateMapped<T extends Record<string, any>> = {
	[K in keyof T]: K extends `${infer N}_datetime`
		? Date
		: T[K] extends object
		? DateMapped<T[K]>
		: T[K];
};
