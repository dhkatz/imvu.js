/**
 * Stateless account-ownership challenges. A challenge binds an IMVU user id, an
 * optional consumer-side subject, an issue time and a random nonce under an HMAC.
 * The token carries all of that, so nothing needs storing between issuing and
 * verifying; the short code shown to the user is derived from the MAC.
 */

const TOKEN_VERSION = 'v1';
// Crockford base32: no I, L, O or U, so codes survive being read aloud or retyped.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_BYTES = 5; // 40 bits → 8 base32 characters
const MINIMUM_SECRET_BYTES = 16;

export type ChallengeSecret = string | ArrayBuffer | Uint8Array | CryptoKey;

export interface Challenge {
	/** The code the user puts in their tagline, e.g. `IMVU-7F3K-92QD`. */
	code: string;
	/** Opaque token to hand back to {@link verifyChallenge}; safe to give to the client. */
	token: string;
	/** The IMVU user (cid) the challenge was issued for. */
	userId: string;
	/** The consumer-side identity the proof is bound to, if one was given. */
	subject?: string;
	issuedAt: Date;
}

export interface CreateChallengeOptions {
	secret: ChallengeSecret;
	/** The IMVU user id (cid) whose ownership is being proven. */
	userId: string | number;
	/**
	 * Who is asking, in the consumer's terms (a site account id, a Discord id, …).
	 * Binding it means a proof can only link the IMVU account to that subject.
	 */
	subject?: string;
	/** Code prefix. Defaults to `IMVU`. */
	prefix?: string;
	/** Override the clock (tests). */
	now?: Date;
}

interface TokenPayload {
	/** user id */
	u: string;
	/** subject */
	s?: string;
	/** issued at, unix seconds */
	t: number;
	/** nonce */
	n: string;
	/** code prefix */
	p: string;
}

/** Issue a new challenge. Every call returns a different code, even for the same user. */
export async function createChallenge(options: CreateChallengeOptions): Promise<Challenge> {
	const userId = String(options.userId);
	if (!userId) throw new TypeError('createChallenge requires a userId');

	const prefix = options.prefix ?? 'IMVU';
	if (!/^[A-Za-z0-9]*$/.test(prefix)) throw new TypeError('The code prefix must be alphanumeric');

	const nonce = new Uint8Array(12);
	crypto.getRandomValues(nonce);

	const payload: TokenPayload = {
		u: userId,
		...(options.subject !== undefined && { s: options.subject }),
		t: Math.floor((options.now ?? new Date()).getTime() / 1000),
		n: base64url(nonce),
		p: prefix,
	};
	const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
	const key = await importKey(options.secret);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, signedBytes(body)));

	return toChallenge(payload, `${TOKEN_VERSION}.${body}.${base64url(mac)}`, mac);
}

/**
 * Check a token's signature and return the challenge it describes, or `null` if the
 * token is malformed or was not signed with `secret`. Useful for showing the code
 * again without issuing a new one. Does not look at the user's profile.
 */
export async function readChallenge(options: { secret: ChallengeSecret; token: string }): Promise<Challenge | null> {
	const parsed = parseToken(options.token);
	if (!parsed) return null;

	const key = await importKey(options.secret);
	const valid = await crypto.subtle.verify('HMAC', key, parsed.mac, signedBytes(parsed.body));
	return valid ? toChallenge(parsed.payload, options.token, parsed.mac) : null;
}

/** True when `text` contains `code`, ignoring case, spacing, punctuation and Crockford look-alikes. */
export function containsCode(text: string, code: string): boolean {
	const needle = normalizeCode(code);
	return needle.length > 0 && normalizeCode(text).includes(needle);
}

/** @internal */
export function parseToken(
	token: string
): { payload: TokenPayload; body: string; mac: Uint8Array<ArrayBuffer> } | null {
	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;

	try {
		const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1]))) as Partial<TokenPayload>;
		const mac = fromBase64url(parts[2]);
		if (
			typeof payload.u !== 'string' ||
			typeof payload.t !== 'number' ||
			typeof payload.n !== 'string' ||
			typeof payload.p !== 'string' ||
			(payload.s !== undefined && typeof payload.s !== 'string') ||
			mac.length < CODE_BYTES
		) {
			return null;
		}
		return { payload: payload as TokenPayload, body: parts[1], mac };
	} catch {
		return null;
	}
}

function toChallenge(payload: TokenPayload, token: string, mac: Uint8Array): Challenge {
	return {
		code: formatCode(payload.p, mac),
		token,
		userId: payload.u,
		...(payload.s !== undefined && { subject: payload.s }),
		issuedAt: new Date(payload.t * 1000),
	};
}

function formatCode(prefix: string, mac: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let digits = '';
	for (const byte of mac.subarray(0, CODE_BYTES)) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			digits += CODE_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	const groups = `${digits.slice(0, 4)}-${digits.slice(4)}`;
	return prefix ? `${prefix.toUpperCase()}-${groups}` : groups;
}

function normalizeCode(text: string): string {
	return text
		.toUpperCase()
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1')
		.replace(/[^0-9A-Z]/g, '');
}

function signedBytes(body: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(`${TOKEN_VERSION}.${body}`);
}

const keys = new WeakMap<object, Promise<CryptoKey>>();

async function importKey(secret: ChallengeSecret): Promise<CryptoKey> {
	if (isCryptoKey(secret)) return secret;

	const bytes =
		typeof secret === 'string'
			? new TextEncoder().encode(secret)
			: secret instanceof Uint8Array
				? new Uint8Array(secret)
				: new Uint8Array(secret.slice(0));
	if (bytes.length < MINIMUM_SECRET_BYTES) {
		throw new RangeError(`The challenge secret must be at least ${MINIMUM_SECRET_BYTES} bytes`);
	}

	// Cache imports per secret object; strings are imported each time (they cannot key a WeakMap).
	if (typeof secret === 'string') return importRaw(bytes);
	let key = keys.get(secret);
	if (!key) {
		key = importRaw(bytes);
		keys.set(secret, key);
	}
	return key;
}

function importRaw(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function isCryptoKey(secret: ChallengeSecret): secret is CryptoKey {
	return typeof CryptoKey !== 'undefined' && secret instanceof CryptoKey;
}

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SyntaxError('Invalid base64url');
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
