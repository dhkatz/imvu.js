import { containsCode, createChallenge, readChallenge, taglineLookup, verifyChallenge } from '../src/index.js';

const secret = 'test-secret-that-is-long-enough';
const issued = new Date('2026-10-22T12:00:00Z');

const userResponse = (id: string, tagline: unknown) =>
	new Response(
		JSON.stringify({
			status: 'success',
			id: `https://api.imvu.com/user/user-${id}`,
			denormalized: { [`https://api.imvu.com/user/user-${id}`]: { data: { tagline }, relations: {} } },
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);

describe('createChallenge', () => {
	it('issues a readable code bound to the user and subject', async () => {
		const challenge = await createChallenge({ secret, userId: 42, subject: 'site:alice', now: issued });

		expect(challenge.code).toMatch(/^IMVU-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
		expect(challenge.userId).toBe('42');
		expect(challenge.subject).toBe('site:alice');
		expect(challenge.issuedAt).toEqual(issued);
		expect(challenge.token).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
	});

	it('never repeats a code for the same user', async () => {
		const codes = new Set<string>();
		for (let i = 0; i < 20; i++) codes.add((await createChallenge({ secret, userId: 42, now: issued })).code);
		expect(codes.size).toBe(20);
	});

	it('supports a custom prefix and rejects short secrets', async () => {
		expect((await createChallenge({ secret, userId: 1, prefix: 'mysite' })).code).toMatch(/^MYSITE-/);
		await expect(createChallenge({ secret: 'short', userId: 1 })).rejects.toThrow(RangeError);
	});
});

describe('readChallenge', () => {
	it('round-trips with the right secret and rejects tampering', async () => {
		const challenge = await createChallenge({ secret, userId: 7, subject: 's', now: issued });

		await expect(readChallenge({ secret, token: challenge.token })).resolves.toEqual(challenge);
		await expect(readChallenge({ secret: `${secret}!`, token: challenge.token })).resolves.toBeNull();

		const [version, body, mac] = challenge.token.split('.');
		const forged = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
		forged.u = '8';
		const forgedBody = btoa(JSON.stringify(forged)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		await expect(readChallenge({ secret, token: `${version}.${forgedBody}.${mac}` })).resolves.toBeNull();
		await expect(readChallenge({ secret, token: 'garbage' })).resolves.toBeNull();
	});
});

describe('containsCode', () => {
	it('ignores case, spacing, punctuation and Crockford look-alikes', () => {
		expect(containsCode('hi! imvu 7f3k-92qd :)', 'IMVU-7F3K-92QD')).toBe(true);
		expect(containsCode('IMVU-7F3K-92QO', 'IMVU-7F3K-92Q0')).toBe(true);
		expect(containsCode('IMVU-7F3K', 'IMVU-7F3K-92QD')).toBe(false);
		expect(containsCode('anything', '')).toBe(false);
	});
});

describe('verifyChallenge', () => {
	it('succeeds when the code is present', async () => {
		const challenge = await createChallenge({ secret, userId: 42, subject: 'alice', now: issued });
		const lookup = vi.fn().mockResolvedValue(`love music ✨ ${challenge.code}`);

		const result = await verifyChallenge({ secret, token: challenge.token, lookup, now: issued });

		expect(result).toMatchObject({ ok: true, userId: '42', subject: 'alice', issuedAt: issued });
		expect(lookup).toHaveBeenCalledWith('42');
	});

	it('reports why it failed', async () => {
		const challenge = await createChallenge({ secret, userId: 42, subject: 'alice', now: issued });
		const later = new Date(issued.getTime() + 10 * 60_000);
		const present = async () => challenge.code;
		const check = (options: Partial<Parameters<typeof verifyChallenge>[0]>) =>
			verifyChallenge({ secret, token: challenge.token, lookup: present, now: issued, ...options });

		await expect(check({ lookup: async () => 'old tagline' })).resolves.toMatchObject({
			ok: false,
			reason: 'code-not-found',
		});
		await expect(check({ lookup: async () => null })).resolves.toMatchObject({ reason: 'user-not-found' });
		await expect(check({ maxAge: 5 * 60_000, now: later })).resolves.toMatchObject({ reason: 'expired' });
		await expect(check({ maxAge: 15 * 60_000, now: later })).resolves.toMatchObject({ ok: true });
		await expect(check({ expect: { subject: 'mallory' } })).resolves.toMatchObject({ reason: 'mismatch' });
		await expect(check({ expect: { userId: 43 } })).resolves.toMatchObject({ reason: 'mismatch' });
		await expect(check({ expect: { userId: '42', subject: 'alice' } })).resolves.toMatchObject({ ok: true });
		await expect(check({ token: 'v1.x.y' })).resolves.toMatchObject({ reason: 'invalid-token' });
		await expect(check({ now: new Date(issued.getTime() - 5 * 60_000) })).resolves.toMatchObject({
			reason: 'invalid-token',
		});
	});

	it('rejects instead of failing when the lookup itself errors', async () => {
		const challenge = await createChallenge({ secret, userId: 42 });
		const lookup = vi.fn().mockRejectedValue(new Error('network down'));

		await expect(verifyChallenge({ secret, token: challenge.token, lookup })).rejects.toThrow('network down');
	});

	it("does not accept another user's code", async () => {
		const mine = await createChallenge({ secret, userId: 1, subject: 'me' });
		const theirs = await createChallenge({ secret, userId: 1, subject: 'attacker' });

		const result = await verifyChallenge({ secret, token: theirs.token, lookup: async () => mine.code });

		expect(result).toMatchObject({ ok: false, reason: 'code-not-found' });
	});
});

describe('taglineLookup', () => {
	it('reads the tagline anonymously from the user endpoint', async () => {
		const fetch = vi.fn().mockResolvedValue(userResponse('42', 'hello IMVU-AAAA-BBBB'));

		await expect(taglineLookup({ fetch })('42')).resolves.toBe('hello IMVU-AAAA-BBBB');
		expect(fetch).toHaveBeenCalledWith(
			'https://api.imvu.com/user/user-42',
			expect.objectContaining({ cache: 'no-store' })
		);
	});

	it('maps missing users to null and server errors to rejections', async () => {
		const notFound = vi.fn().mockResolvedValue(new Response('{"status":"failure"}', { status: 404 }));
		const failure = vi
			.fn()
			.mockResolvedValue(new Response('{"status":"failure","error":"X","message":"m"}', { status: 500 }));

		await expect(taglineLookup({ fetch: notFound })('1')).resolves.toBeNull();
		await expect(taglineLookup({ fetch: failure })('1')).rejects.toThrow(/500/);
	});

	it('treats a missing tagline as empty text', async () => {
		const fetch = vi.fn().mockResolvedValue(userResponse('5', null));
		await expect(taglineLookup({ fetch, baseURL: 'https://proxy.example/' })('5')).resolves.toBe('');
		expect(fetch.mock.calls[0][0]).toBe('https://proxy.example/user/user-5');
	});
});
