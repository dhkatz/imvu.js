import { containsCode, readChallenge, type Challenge, type ChallengeSecret } from './challenge.js';
import { taglineLookup } from './lookup.js';

/** Returns the public text to search for the code, or `null` if the user does not exist. */
export type ProofLookup = (userId: string) => Promise<string | null>;

export interface VerifyChallengeOptions {
	secret: ChallengeSecret;
	token: string;
	/**
	 * Where to look for the code. Defaults to the user's tagline, read anonymously
	 * from the public REST API (see {@link taglineLookup}).
	 */
	lookup?: ProofLookup;
	/** Reject tokens older than this many milliseconds. Expiry is otherwise the caller's policy. */
	maxAge?: number;
	/** Require the token to have been issued for this IMVU user and/or subject. */
	expect?: { userId?: string | number; subject?: string };
	/** Override the clock (tests). */
	now?: Date;
}

export type VerificationFailure =
	/** Not a token this library issued, or not signed with this secret. */
	| 'invalid-token'
	/** Signed correctly but for a different user or subject than `expect`. */
	| 'mismatch'
	/** Older than `maxAge`. */
	| 'expired'
	/** The user does not exist (or their profile is unreadable). */
	| 'user-not-found'
	/** The profile was read but does not contain the code (yet). */
	| 'code-not-found';

export type VerificationResult =
	| { ok: true; challenge: Challenge; userId: string; subject?: string; issuedAt: Date; checkedAt: Date }
	| { ok: false; reason: VerificationFailure; challenge?: Challenge; checkedAt: Date };

/** Clock skew tolerated for tokens that claim to be issued in the future. */
const FUTURE_SKEW_MS = 60_000;

/**
 * Check a challenge: validate the token, then read the user's profile once and look
 * for the code. Stateless, so a token verifies repeatedly until the caller's expiry;
 * callers that need single use should record `challenge.token` (or its nonce) once it
 * succeeds. Lookup failures (network, rate limits) reject rather than resolve, so an
 * indeterminate check is never reported as `code-not-found`.
 */
export async function verifyChallenge(options: VerifyChallengeOptions): Promise<VerificationResult> {
	const now = options.now ?? new Date();
	const fail = (reason: VerificationFailure, challenge?: Challenge): VerificationResult => ({
		ok: false,
		reason,
		...(challenge && { challenge }),
		checkedAt: now,
	});

	const challenge = await readChallenge(options);
	if (!challenge) return fail('invalid-token');

	const expected = options.expect;
	if (expected?.userId !== undefined && String(expected.userId) !== challenge.userId) {
		return fail('mismatch', challenge);
	}
	if (expected?.subject !== undefined && expected.subject !== challenge.subject) return fail('mismatch', challenge);

	const age = now.getTime() - challenge.issuedAt.getTime();
	if (age < -FUTURE_SKEW_MS) return fail('invalid-token', challenge);
	if (options.maxAge !== undefined && age > options.maxAge) return fail('expired', challenge);

	const lookup = options.lookup ?? taglineLookup();
	const text = await lookup(challenge.userId);
	if (text === null) return fail('user-not-found', challenge);
	if (!containsCode(text, challenge.code)) return fail('code-not-found', challenge);

	return {
		ok: true,
		challenge,
		userId: challenge.userId,
		...(challenge.subject !== undefined && { subject: challenge.subject }),
		issuedAt: challenge.issuedAt,
		checkedAt: now,
	};
}
