import { EventEmitter } from 'node:events';

import type { RemoteDocument } from '../resources/RemoteDocument.js';

export interface DocumentInvalidation<T extends RemoteDocument> {
	document: T;
	revision: number;
	receivedAt: Date;
}

export interface DocumentWatchEvents<T extends RemoteDocument> {
	invalidate: [event: DocumentInvalidation<T>];
}

/** A disposable, reference-counted observation of one remote document. */
export class DocumentWatch<T extends RemoteDocument> extends EventEmitter<DocumentWatchEvents<T>> {
	#closed = false;

	public constructor(
		public readonly document: T,
		private readonly closeWatch: () => void
	) {
		super();
	}

	public get closed(): boolean {
		return this.#closed;
	}

	/** @internal */
	public _emitInvalidation(): void {
		if (this.#closed) return;
		this.emit('invalidate', { document: this.document, revision: this.document.revision, receivedAt: new Date() });
	}

	public close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.closeWatch();
		this.removeAllListeners();
	}
}
