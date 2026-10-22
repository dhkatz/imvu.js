import { fileCookieStorage, type CookieStorage } from '@imvu/rest';
import {
	FaultCode,
	XmlRpcFault,
	XmlRpcGateway,
	type AuthorizeProductsOptions,
	type CallOptions,
	type ProductAuthRequest,
	type ProductAuthorization,
	type XmlRpcSession,
	type XmlRpcValue,
} from '@imvu/xmlrpc';

/** Persists a string blob between runs (same shape as the REST cookie storage). */
export type SessionStorage = CookieStorage;

export interface XmlRpcCoordinatorOptions {
	/** The gateway to use. Defaults to a new {@link XmlRpcGateway} with default options. */
	gateway?: XmlRpcGateway;
	/**
	 * Where the gateway session persists, so restarts reuse it instead of logging in
	 * again. Defaults to `./xmlrpc-session.json` outside browsers; `null` disables it.
	 */
	sessionStorage?: SessionStorage | null;
	/** Minimum milliseconds between gateway calls. Defaults to `250`. */
	minimumInterval?: number;
}

interface Credentials {
	username: string;
	password: string;
}

interface SavedSession {
	username: string;
	session: XmlRpcSession;
}

const isBrowser = (): boolean => typeof (globalThis as { document?: unknown }).document !== 'undefined';

/**
 * Owns the client's XML-RPC gateway session. Logs in lazily on the first call,
 * persists the session across runs, re-authenticates once when the server
 * reports the session invalid, and paces calls to a minimum interval.
 */
export class XmlRpcCoordinator {
	public readonly gateway: XmlRpcGateway;

	private credentials?: Credentials;
	private authenticating?: Promise<void>;
	private readonly storage: SessionStorage | null;
	private readonly minimumInterval: number;
	private queue: Promise<unknown> = Promise.resolve();
	private lastCallAt = 0;

	public constructor(options: XmlRpcCoordinatorOptions = {}) {
		this.gateway = options.gateway ?? new XmlRpcGateway();
		this.storage =
			options.sessionStorage !== undefined
				? options.sessionStorage
				: isBrowser()
					? null
					: fileCookieStorage('./xmlrpc-session.json');
		this.minimumInterval = options.minimumInterval ?? 250;
	}

	/** @internal Called by `Client.login`; no gateway request is made until first use. */
	public _setCredentials(username: string, password: string): void {
		if (this.credentials?.username.toLowerCase() !== username.toLowerCase()) {
			this.gateway.logout();
		}
		this.credentials = { username, password };
	}

	/** @internal Called by `Client.logout`. The saved session is kept for the next run. */
	public _clear(): void {
		this.credentials = undefined;
		this.authenticating = undefined;
		this.gateway.logout();
	}

	/** Invoke a gateway method with the client's session. */
	public call(method: string, params: readonly XmlRpcValue[] = [], options: CallOptions = {}): Promise<XmlRpcValue> {
		return this.withSession(() => this.gateway.call(method, params, options));
	}

	/** Resolve products to their current CFL URL, checksum and parent (ancestors included). */
	public authorizeProducts(
		products: readonly (number | ProductAuthRequest)[],
		options?: AuthorizeProductsOptions
	): Promise<ProductAuthorization[]> {
		return this.withSession(() => this.gateway.authorizeProducts(products, options));
	}

	private async withSession<T>(operation: () => Promise<T>): Promise<T> {
		await this.ensureSession();
		try {
			return await this.paced(operation);
		} catch (error) {
			if (!(error instanceof XmlRpcFault && error.code === FaultCode.InvalidAuthData)) throw error;
			// The session expired or another login replaced it: log in again once.
			await this.authenticate();
			return this.paced(operation);
		}
	}

	/** Run calls one at a time, at least `minimumInterval` ms apart. */
	private paced<T>(operation: () => Promise<T>): Promise<T> {
		const run = async () => {
			const wait = this.lastCallAt + this.minimumInterval - Date.now();
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
			try {
				return await operation();
			} finally {
				this.lastCallAt = Date.now();
			}
		};
		const result = this.queue.then(run, run);
		this.queue = result.catch(() => {});
		return result;
	}

	private async ensureSession(): Promise<void> {
		if (this.gateway.session) return;
		const credentials = this.requireCredentials();

		const saved = await this.loadSession();
		if (saved && saved.username.toLowerCase() === credentials.username.toLowerCase()) {
			this.gateway.session = saved.session;
			return;
		}

		await this.authenticate();
	}

	private authenticate(): Promise<void> {
		// Concurrent callers share one login.
		this.authenticating ??= (async () => {
			const { username, password } = this.requireCredentials();
			try {
				await this.paced(() => this.gateway.login({ username, password }));
				if (this.gateway.session) await this.saveSession({ username, session: this.gateway.session });
			} finally {
				this.authenticating = undefined;
			}
		})();
		return this.authenticating;
	}

	private requireCredentials(): Credentials {
		if (!this.credentials) throw new Error('The XML-RPC gateway requires client.login() first');
		return this.credentials;
	}

	private async loadSession(): Promise<SavedSession | null> {
		if (!this.storage) return null;
		try {
			const raw = await this.storage.load();
			const saved = raw ? (JSON.parse(raw) as Partial<SavedSession>) : null;
			const session = saved?.session;
			if (!saved?.username || !session?.securityKey || !session.clientSessionId || !session.userId) return null;
			return saved as SavedSession;
		} catch {
			return null; // unreadable — behave as if nothing was saved
		}
	}

	private async saveSession(saved: SavedSession): Promise<void> {
		if (!this.storage) return;
		try {
			await this.storage.save(JSON.stringify(saved));
		} catch {
			// A failed save only costs a login on the next run.
		}
	}
}
