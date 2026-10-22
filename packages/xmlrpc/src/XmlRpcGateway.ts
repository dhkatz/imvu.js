import { decodeMethodResponse, encodeMethodCall, type XmlRpcValue } from './codec.js';
import { FaultCode, XmlRpcFault, XmlRpcHttpError } from './errors.js';
import { md5 } from './md5.js';
import { flattenTable, unflattenTable } from './tables.js';

/** The gateway's XML-RPC hosts (as the classic client names them). */
export type XmlRpcHost = 'client' | 'secure' | 'chat';

/**
 * Default endpoints. `secure` handles login; most calls go to `client`. The classic
 * client uses plain HTTP for `client` and `chat`; both also serve HTTPS, which keeps
 * signed calls off the wire in clear text and works from HTTPS pages.
 */
export const XMLRPC_ENDPOINTS: Readonly<Record<XmlRpcHost, string>> = {
	client: 'https://client-dynamic.imvu.com/api/xmlrpc/client.php',
	secure: 'https://secure.imvu.com/api/xmlrpc/client.php',
	chat: 'https://chat.imvu.com/api/xmlrpc/chat.php',
};

/** Classic-client version reported at login. */
export const CLIENT_VERSION = '554.8';

/** Highest CFL format the client understands (the classic client's `CFL_FORMAT_VERSION`). */
export const CFL_FORMAT_VERSION = 9;

/** The credentials that sign gateway calls, issued by {@link XmlRpcGateway.login}. */
export interface XmlRpcSession {
	userId: number;
	securityKey: string;
	clientSessionId: string;
}

/**
 * Called when the server returns fault 110 (ProofOfWorkRequired). The handler
 * should obtain and solve a challenge (typically by POSTing to the REST API's
 * `/pow/` collection) so the gateway can retry the original call.
 *
 * @param session - The current session (user ID, security key, CSID).
 * @param fetch   - The `fetch` implementation the gateway was constructed with.
 */
export type ProofOfWorkHandler = (session: XmlRpcSession, fetch: typeof globalThis.fetch) => Promise<void>;

export interface XmlRpcGatewayOptions {
	/** The `fetch` implementation to use. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Override individual endpoints (e.g. to route through a proxy). */
	endpoints?: Partial<Record<XmlRpcHost, string>>;
	/** Resume a previously issued session instead of logging in. */
	session?: XmlRpcSession;
	/**
	 * When set, fault 110 triggers this handler and the call is retried. If
	 * unset, fault 110 throws like any other fault.
	 */
	proofOfWork?: ProofOfWorkHandler;
	/** Maximum PoW retry attempts per call. Defaults to `3`. */
	maxPowRetries?: number;
}

export interface CallOptions {
	host?: XmlRpcHost;
	signal?: AbortSignal;
}

/** Exactly one credential: a password, an existing web `sessionID`, or an `authCode`. */
export type LoginCredential = { password: string } | { sessionID: string } | { authCode: string };

export type LoginOptions = LoginCredential & {
	username: string;
	twoFactorCode?: string;
	/** Hardware details the classic client reports. Sent empty by default. */
	systemInfo?: Record<string, XmlRpcValue>;
	clientVersion?: string;
};

/** The account details returned by login (only the fields this package relies on are typed). */
export interface LoginInfo {
	userId: number | string;
	securityKey: string;
	clientSessionId: string;
	avatarName?: string;
	imq_auth_token?: string;
	[field: string]: XmlRpcValue | undefined;
}

/** One `(user, product)` pair to authorize; `userId` defaults to the session user. */
export interface ProductAuthRequest {
	productId: number;
	userId?: number;
}

/** The server's answer for one product: where its current CFL lives and how it may be used. */
export interface ProductAuthorization {
	userId: number;
	productId: number;
	parentProductId: number;
	/** URL of the product's current CFL, e.g. `http://userimages-akm.imvu.com/productdata/{pid}/{revision}`. */
	cflUrl: string;
	/** MD5 (hex) of the CFL's bytes. */
	cflChecksum: string;
	usableDirect: number;
	usableDerivation: number;
	usableTrial: number;
	trialTimeout: number;
	usablePeerReview?: XmlRpcValue;
	autoAuth?: XmlRpcValue;
	sub_pids?: XmlRpcValue;
	info?: XmlRpcValue;
	[field: string]: XmlRpcValue | undefined;
}

export interface AuthorizeProductsOptions {
	/** Ask for IMVU's optimized ("extracted") assets when available. Defaults to `true`, like the classic client. */
	useExtractedAssets?: boolean;
	maxSupportedFormat?: number;
	signal?: AbortSignal;
}

const AUTH_INT_FIELDS = [
	'userId',
	'productId',
	'parentProductId',
	'usableDirect',
	'usableDerivation',
	'usableTrial',
	'trialTimeout',
] as const;

/**
 * Client for IMVU's legacy XML-RPC gateway — the API the classic client still uses
 * for things the REST API does not expose, such as resolving a product's current CFL.
 *
 * Calls are signed with the session from {@link login}: `X-imvu-auth` is
 * `md5(userId + securityKey + requestBody)`.
 */
export class XmlRpcGateway {
	public session?: XmlRpcSession;

	private readonly fetchImpl: typeof fetch;
	private readonly endpoints: Record<XmlRpcHost, string>;
	private readonly proofOfWork?: ProofOfWorkHandler;
	private readonly maxPowRetries: number;

	public constructor(options: XmlRpcGatewayOptions = {}) {
		this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.endpoints = { ...XMLRPC_ENDPOINTS, ...options.endpoints };
		this.session = options.session;
		this.proofOfWork = options.proofOfWork;
		this.maxPowRetries = options.maxPowRetries ?? 3;
	}

	/** Invoke `method` and return its decoded result. Faults throw {@link XmlRpcFault}. */
	public async call(
		method: string,
		params: readonly XmlRpcValue[] = [],
		options: CallOptions = {}
	): Promise<XmlRpcValue> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.send(method, params, options);
			} catch (error) {
				if (
					error instanceof XmlRpcFault &&
					error.code === FaultCode.ProofOfWorkRequired &&
					this.proofOfWork &&
					this.session &&
					attempt < this.maxPowRetries
				) {
					await this.proofOfWork(this.session, this.fetchImpl);
					continue;
				}
				throw error;
			}
		}
	}

	private async send(method: string, params: readonly XmlRpcValue[], options: CallOptions): Promise<XmlRpcValue> {
		const url = this.endpoints[options.host ?? 'client'];
		const body = encodeMethodCall(method, params);
		const headers = new Headers({ 'content-type': 'text/xml' });

		if (this.session) {
			const { userId, securityKey, clientSessionId } = this.session;
			headers.set('x-imvu-userid', String(userId));
			headers.set('x-imvu-csid', clientSessionId);
			headers.set('x-imvu-auth', md5(`${userId}${securityKey}${body}`));
		}

		const response = await this.fetchImpl(url, { method: 'POST', headers, body, signal: options.signal });
		if (!response.ok) throw new XmlRpcHttpError(response.status, url);

		return decodeMethodResponse(await response.text());
	}

	/** Log in on the secure host and adopt the issued session. */
	public async login(options: LoginOptions): Promise<LoginInfo> {
		const params: Record<string, XmlRpcValue> = {
			avatarname: options.username,
			client_version: options.clientVersion ?? CLIENT_VERSION,
			system_info: options.systemInfo ?? {},
			client_type: 'imvu',
			client_experiments: [],
		};
		if ('password' in options) params.password = options.password;
		else if ('sessionID' in options) params.sessionID = options.sessionID;
		else params.authCode = options.authCode;
		if (options.twoFactorCode !== undefined) params.twofa_code = options.twoFactorCode;

		const info = (await this.call('test.avatarInfoForLogin2', [params], { host: 'secure' })) as unknown as LoginInfo;
		this.session = {
			userId: Number(info.userId),
			securityKey: String(info.securityKey),
			clientSessionId: String(info.clientSessionId),
		};
		return info;
	}

	/** Forget the session (the server-side session is left to expire). */
	public logout(): void {
		this.session = undefined;
	}

	/**
	 * Resolve products to their current CFL (URL, checksum, parent) and usage rights.
	 *
	 * The server also returns every **ancestor** of each requested product (following
	 * `parentProductId` down to a base product whose parent is `0`), since a derived
	 * product's CFL imports its parent's. Products the server refuses are omitted.
	 */
	public async authorizeProducts(
		products: readonly (number | ProductAuthRequest)[],
		options: AuthorizeProductsOptions = {}
	): Promise<ProductAuthorization[]> {
		if (products.length === 0) return [];
		const session = this.requireSession('authorizeProducts');

		const auths = flattenTable(
			products.map((product) => {
				const request = typeof product === 'number' ? { productId: product } : product;
				return { userId: request.userId ?? session.userId, productId: request.productId };
			})
		);

		const result = await this.call(
			'test.authorizeProducts2',
			[
				{
					auths,
					use_extracted_assets_if_available: options.useExtractedAssets === false ? 0 : 1,
					max_supported_format: options.maxSupportedFormat ?? CFL_FORMAT_VERSION,
				},
			],
			{ signal: options.signal }
		);

		return unflattenTable<Record<string, XmlRpcValue>>(result).flatMap((row) => {
			const auth = { ...row } as Record<string, XmlRpcValue | undefined>;
			for (const field of AUTH_INT_FIELDS) {
				if (auth[field] === undefined) continue;
				const value = Number(auth[field]);
				if (!Number.isFinite(value)) return []; // malformed row — the classic client drops these too
				auth[field] = value;
			}
			return [auth as ProductAuthorization];
		});
	}

	private requireSession(operation: string): XmlRpcSession {
		if (!this.session) throw new Error(`${operation} requires a session; call login() first`);
		return this.session;
	}
}
