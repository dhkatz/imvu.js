import { createHash } from 'node:crypto';

import {
	FaultCode,
	XmlRpcFault,
	XmlRpcGateway,
	XmlRpcHttpError,
	decodeMethodResponse,
	encodeMethodCall,
	flattenTable,
	md5,
	parseRswNonce,
	solveRsw,
	solveRswAsync,
	unflattenTable,
	type XmlRpcValue,
} from '../src/index.js';

const nodeMd5 = (value: string | Uint8Array) => createHash('md5').update(value).digest('hex');

const response = (value: string) =>
	`<?xml version="1.0"?>\n<methodResponse>\n<params>\n<param>\n<value>${value}</value>\n</param>\n</params>\n</methodResponse>\n`;

const fault = (code: number, message: string) =>
	`<?xml version="1.0"?><methodResponse><fault><value><struct>` +
	`<member><name>faultCode</name><value><int>${code}</int></value></member>` +
	`<member><name>faultString</name><value><string>${message}</string></value></member>` +
	`</struct></value></fault></methodResponse>`;

describe('md5', () => {
	it('matches the RFC 1321 test vectors', () => {
		expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
		expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
		expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
	});

	it('matches node:crypto across block boundaries, UTF-8 text and raw bytes', () => {
		for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
			const text = 'x'.repeat(length);
			expect(md5(text), `length ${length}`).toBe(nodeMd5(text));
		}
		expect(md5('héllo ✨ 世界')).toBe(nodeMd5('héllo ✨ 世界'));

		const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff);
		expect(md5(bytes)).toBe(nodeMd5(bytes));
	});
});

describe('XML-RPC codec', () => {
	it('encodes every value type', () => {
		const xml = encodeMethodCall('test.echo', [
			'a<b&c',
			42,
			-0x80000000,
			2 ** 31,
			1.5,
			true,
			null,
			new Date(Date.UTC(2026, 9, 21, 12, 30, 5)),
			new Uint8Array([104, 105]),
			[1, 'two'],
			{ name: 'x', skipped: undefined },
		]);

		expect(xml).toBe(
			'<?xml version="1.0"?><methodCall><methodName>test.echo</methodName><params>' +
				'<param><value><string>a&lt;b&amp;c</string></value></param>' +
				'<param><value><int>42</int></value></param>' +
				'<param><value><int>-2147483648</int></value></param>' +
				'<param><value><double>2147483648</double></value></param>' +
				'<param><value><double>1.5</double></value></param>' +
				'<param><value><boolean>1</boolean></value></param>' +
				'<param><value><nil/></value></param>' +
				'<param><value><dateTime.iso8601>20261021T12:30:05</dateTime.iso8601></value></param>' +
				'<param><value><base64>aGk=</base64></value></param>' +
				'<param><value><array><data><value><int>1</int></value><value><string>two</string></value></data></array></value></param>' +
				'<param><value><struct><member><name>name</name><value><string>x</string></value></member></struct></value></param>' +
				'</params></methodCall>'
		);
	});

	it('decodes typed, untyped and nested values', () => {
		const value = decodeMethodResponse(
			response(
				'<struct>' +
					'<member><name>i4</name><value><i4>7</i4></value></member>' +
					'<member><name>int</name><value><int> -3 </int></value></member>' +
					'<member><name>flag</name><value><boolean>0</boolean></value></member>' +
					'<member><name>plain</name><value>untyped &amp; &#233;&#x2728;</value></member>' +
					'<member><name>cdata</name><value><string><![CDATA[<raw>]]></string></value></member>' +
					'<member><name>empty</name><value><string/></value></member>' +
					'<member><name>none</name><value><nil/></value></member>' +
					'<member><name>when</name><value><dateTime.iso8601>2026-10-21T12:30:05</dateTime.iso8601></value></member>' +
					'<member><name>bytes</name><value><base64>\n aGk=\n</base64></value></member>' +
					'<member><name>list</name><value><array><data>\n<value><double>2.5</double></value>\n<value>s</value>\n</data></array></value></member>' +
					'</struct>'
			)
		);

		expect(value).toEqual({
			i4: 7,
			int: -3,
			flag: false,
			plain: 'untyped & é✨',
			cdata: '<raw>',
			empty: '',
			none: null,
			when: new Date(Date.UTC(2026, 9, 21, 12, 30, 5)),
			bytes: new Uint8Array([104, 105]),
			list: [2.5, 's'],
		});
	});

	it('round-trips through encode and decode', () => {
		const original: XmlRpcValue = {
			auths: [
				['userId', 'productId'],
				[1, 2],
			],
			text: '<&>',
			ok: true,
		};
		const call = encodeMethodCall('m', [original]);
		const asResponse = call
			.replace(/<methodCall><methodName>m<\/methodName><params>/, '<methodResponse><params>')
			.replace('</methodCall>', '</methodResponse>');

		expect(decodeMethodResponse(asResponse)).toEqual(original);
	});

	it('throws faults with their code and message', () => {
		const decode = () => decodeMethodResponse(fault(FaultCode.InvalidAuthData, 'invalid auth data'));

		expect(decode).toThrow(XmlRpcFault);
		expect(decode).toThrow(expect.objectContaining({ code: 30, message: 'invalid auth data' }));
	});

	it('rejects malformed documents', () => {
		expect(() => decodeMethodResponse('<methodResponse><params>')).toThrow(SyntaxError);
		expect(() => decodeMethodResponse('<other/>')).toThrow(/methodResponse/);
	});
});

describe('tables', () => {
	it('flattens rows into a header table and back', () => {
		const rows = [
			{ userId: 1, productId: 2 },
			{ userId: 1, productId: 3 },
		];
		const table = flattenTable(rows);

		expect(table).toEqual([
			['userId', 'productId'],
			[1, 2],
			[1, 3],
		]);
		expect(unflattenTable(table)).toEqual(rows);
		expect(unflattenTable([])).toEqual([]);
		expect(() => flattenTable([])).toThrow(RangeError);
	});
});

type Call = { url: string; headers: Headers; body: string };

const scriptedFetch = (...bodies: (string | Response)[]) => {
	const calls: Call[] = [];
	const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
		calls.push({ url, headers: new Headers(init.headers), body: init.body as string });
		const next = bodies.shift();
		if (next === undefined) throw new Error(`Unexpected request to ${url}`);
		return typeof next === 'string' ? new Response(next) : next;
	});
	return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
};

const session = { userId: 313, securityKey: 'k3y', clientSessionId: 'csid-1' };

describe('XmlRpcGateway', () => {
	it('signs calls as md5(userId + securityKey + body)', async () => {
		const { fetch, calls } = scriptedFetch(response('<string>pong</string>'));
		const gateway = new XmlRpcGateway({ fetch, session });

		await expect(gateway.call('test.ping', [{ userId: 313 }])).resolves.toBe('pong');

		const [call] = calls;
		expect(call.url).toBe('https://client-dynamic.imvu.com/api/xmlrpc/client.php');
		expect(call.headers.get('content-type')).toBe('text/xml');
		expect(call.headers.get('x-imvu-userid')).toBe('313');
		expect(call.headers.get('x-imvu-csid')).toBe('csid-1');
		expect(call.headers.get('x-imvu-auth')).toBe(nodeMd5(`313k3y${call.body}`));
	});

	it('sends unsigned calls without a session', async () => {
		const { fetch, calls } = scriptedFetch(response('<int>1</int>'));

		await new XmlRpcGateway({ fetch }).call('test.getHowManyOnline');

		expect(calls[0].headers.has('x-imvu-auth')).toBe(false);
	});

	it('logs in on the secure host and adopts the issued session', async () => {
		const { fetch, calls } = scriptedFetch(
			response(
				'<struct><member><name>userId</name><value><string>313</string></value></member>' +
					'<member><name>securityKey</name><value><string>k3y</string></value></member>' +
					'<member><name>clientSessionId</name><value><int>99</int></value></member></struct>'
			)
		);
		const gateway = new XmlRpcGateway({ fetch });

		await gateway.login({ username: 'Me', password: 'secret' });

		expect(calls[0].url).toBe('https://secure.imvu.com/api/xmlrpc/client.php');
		expect(calls[0].body).toContain('<methodName>test.avatarInfoForLogin2</methodName>');
		expect(calls[0].body).toContain('<name>avatarname</name><value><string>Me</string>');
		expect(calls[0].body).toContain('<name>password</name><value><string>secret</string>');
		expect(calls[0].body).not.toContain('sessionID');
		expect(gateway.session).toEqual({ userId: 313, securityKey: 'k3y', clientSessionId: '99' });
	});

	it('authorizes products as a flattened table and normalizes the result rows', async () => {
		const row = (pid: number, rev: number) =>
			`<value><array><data><value><string>313</string></value><value><string>${pid}</string></value>` +
			`<value><string>10968</string></value><value><string>abc123</string></value>` +
			`<value><string>http://userimages-akm.imvu.com/productdata/${pid}/${rev}</string></value>` +
			`<value><string>1</string></value></data></array></value>`;
		const { fetch, calls } = scriptedFetch(
			response(
				'<array><data><value><array><data><value>userId</value><value>productId</value><value>parentProductId</value>' +
					'<value>cflChecksum</value><value>cflUrl</value><value>usableDirect</value></data></array></value>' +
					row(3234863, 9) +
					row(51522827, 1) +
					'</data></array>'
			)
		);
		const gateway = new XmlRpcGateway({ fetch, session });

		const auths = await gateway.authorizeProducts([3234863, { productId: 51522827, userId: 146702217 }]);

		const body = calls[0].body;
		expect(body).toContain('<methodName>test.authorizeProducts2</methodName>');
		expect(body).toContain(
			'<name>auths</name><value><array><data>' +
				'<value><array><data><value><string>userId</string></value><value><string>productId</string></value></data></array></value>' +
				'<value><array><data><value><int>313</int></value><value><int>3234863</int></value></data></array></value>' +
				'<value><array><data><value><int>146702217</int></value><value><int>51522827</int></value></data></array></value>'
		);
		expect(body).toContain('<name>use_extracted_assets_if_available</name><value><int>1</int>');
		expect(body).toContain('<name>max_supported_format</name><value><int>9</int>');

		expect(auths).toEqual([
			{
				userId: 313,
				productId: 3234863,
				parentProductId: 10968,
				cflChecksum: 'abc123',
				cflUrl: 'http://userimages-akm.imvu.com/productdata/3234863/9',
				usableDirect: 1,
			},
			expect.objectContaining({ productId: 51522827, cflUrl: 'http://userimages-akm.imvu.com/productdata/51522827/1' }),
		]);
	});

	it('requires a session to authorize products', async () => {
		await expect(new XmlRpcGateway({ fetch: scriptedFetch().fetch }).authorizeProducts([1])).rejects.toThrow(
			/login\(\)/
		);
	});

	it('surfaces HTTP failures and faults distinctly', async () => {
		const { fetch } = scriptedFetch(new Response('down', { status: 503 }), fault(FaultCode.ProofOfWorkRequired, 'pow'));
		const gateway = new XmlRpcGateway({ fetch, session });

		await expect(gateway.call('test.ping')).rejects.toBeInstanceOf(XmlRpcHttpError);
		await expect(gateway.call('test.ping')).rejects.toEqual(expect.objectContaining({ code: 110 }));
	});

	it('retries after fault 110 when a proofOfWork handler is set', async () => {
		const { fetch } = scriptedFetch(fault(FaultCode.ProofOfWorkRequired, 'solve me'), response('<string>ok</string>'));
		const handler = vi.fn(async () => {});
		const gateway = new XmlRpcGateway({ fetch, session, proofOfWork: handler });

		await expect(gateway.call('test.ping')).resolves.toBe('ok');
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(session, fetch);
	});

	it('gives up after maxPowRetries consecutive fault 110s', async () => {
		const { fetch } = scriptedFetch(
			fault(FaultCode.ProofOfWorkRequired, 'pow'),
			fault(FaultCode.ProofOfWorkRequired, 'pow'),
			fault(FaultCode.ProofOfWorkRequired, 'pow'),
			fault(FaultCode.ProofOfWorkRequired, 'pow')
		);
		const handler = vi.fn(async () => {});
		const gateway = new XmlRpcGateway({ fetch, session, proofOfWork: handler, maxPowRetries: 2 });

		await expect(gateway.call('test.ping')).rejects.toEqual(expect.objectContaining({ code: 110 }));
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it('does not retry fault 110 without a session', async () => {
		const { fetch } = scriptedFetch(fault(FaultCode.ProofOfWorkRequired, 'pow'));
		const handler = vi.fn(async () => {});
		const gateway = new XmlRpcGateway({ fetch, proofOfWork: handler });

		await expect(gateway.call('test.ping')).rejects.toEqual(expect.objectContaining({ code: 110 }));
		expect(handler).not.toHaveBeenCalled();
	});
});

describe('RSW solver', () => {
	const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
		let result = 1n;
		let value = base % mod;
		for (let e = exp; e > 0n; e >>= 1n) {
			if (e & 1n) result = (result * value) % mod;
			value = (value * value) % mod;
		}
		return result;
	};

	/** Build a puzzle the way the server can: via the totient shortcut rather than T squarings. */
	const puzzle = (p: bigint, q: bigint, t: number, a: bigint, solution: bigint, reduce = false) => {
		const n = p * q;
		const b = modPow(a, modPow(2n, BigInt(t), (p - 1n) * (q - 1n)), n);
		const cipher = reduce ? (solution + b) % n : solution + b;
		return `rsw,${t},${n},${a},${cipher}`;
	};

	it('parses a well-formed nonce', () => {
		expect(parseRswNonce('rsw,10,323,47,1000')).toEqual({ t: 10, n: 323n, a: 47n, cipher: 1000n });
	});

	it.each([
		['hashcash,1,2,3,4'],
		['rsw,1,2,3'],
		['rsw,-1,2,3,4'],
		['rsw,,,,'],
		['rsw,1e3,33,2,4'],
		['rsw,0x10,33,2,4'],
		['rsw,1, 33,2,4'],
		['rsw,1,0,2,4'],
		['rsw,1,1,2,4'],
		['rsw,99999999999999999999,33,2,4'],
	])('rejects the malformed nonce %j', (nonce) => {
		expect(() => parseRswNonce(nonce)).toThrow(SyntaxError);
	});

	it('solves a hand-computed puzzle (T=0)', () => {
		// zero squarings: b = A mod N
		expect(solveRsw('rsw,0,100,42,500')).toBe('458');
	});

	it('solves a hand-computed puzzle (T=1)', () => {
		// b = 7^2 mod 33 = 16
		expect(solveRsw('rsw,1,33,7,100')).toBe('84');
	});

	it('matches a puzzle built with the totient shortcut', () => {
		expect(solveRsw(puzzle(61n, 53n, 10, 2021n, 1234n))).toBe('1234');
	});

	it('recovers the solution when the server reduces the cipher mod N', () => {
		// b = 619 here, so 3000 + 619 wraps past N = 3233
		expect(solveRsw(puzzle(61n, 53n, 10, 2021n, 3000n, true))).toBe('3000');
	});

	it('keeps an unreduced solution larger than N intact', () => {
		expect(solveRsw(puzzle(61n, 53n, 10, 2021n, 10_000n))).toBe('10000');
	});

	it('handles numbers beyond Number.MAX_SAFE_INTEGER', () => {
		expect(solveRsw(puzzle(104729n, 104723n, 20, 9999999999n, 42n))).toBe('42');
	});

	it('solves asynchronously with the same result', async () => {
		const nonce = puzzle(104729n, 104723n, 1000, 9999999999n, 42n);
		await expect(solveRswAsync(nonce, { yieldEvery: 300 })).resolves.toBe(solveRsw(nonce));
	});

	it('stops an async solve when the signal aborts', async () => {
		const controller = new AbortController();
		const solving = solveRswAsync(puzzle(61n, 53n, 1_000_000, 2021n, 1n), {
			signal: controller.signal,
			yieldEvery: 10,
		});
		controller.abort(new Error('cancelled'));
		await expect(solving).rejects.toThrow('cancelled');
	});

	it('rejects an already-aborted signal before squaring', async () => {
		await expect(solveRswAsync('rsw,1,33,7,100', { signal: AbortSignal.abort() })).rejects.toThrow();
	});
});
