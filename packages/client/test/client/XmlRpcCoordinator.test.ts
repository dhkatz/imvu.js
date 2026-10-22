import { FaultCode, XmlRpcFault, type XmlRpcGateway, type XmlRpcSession } from '@imvu/xmlrpc';

import { XmlRpcCoordinator, type SessionStorage } from '../../src/client/XmlRpcCoordinator.js';

const issued: XmlRpcSession = { userId: 313, securityKey: 'k3y', clientSessionId: 'csid' };

/** A stand-in gateway: records logins and calls; `call` behavior is scripted per test. */
const fakeGateway = (call: (method: string) => Promise<unknown> = async () => 'ok') => {
	const gateway = {
		session: undefined as XmlRpcSession | undefined,
		login: vi.fn(async () => {
			gateway.session = { ...issued };
			return { userId: 313, securityKey: 'k3y', clientSessionId: 'csid' };
		}),
		logout: vi.fn(() => {
			gateway.session = undefined;
		}),
		call: vi.fn(call),
		authorizeProducts: vi.fn(async () => []),
	};
	return gateway;
};

const memoryStorage = (saved: string | null = null) => {
	const storage = {
		saved,
		load: vi.fn(async () => storage.saved),
		save: vi.fn(async (value: string) => void (storage.saved = value)),
	};
	return storage satisfies SessionStorage;
};

const coordinator = (gateway: ReturnType<typeof fakeGateway>, storage: SessionStorage | null = null) =>
	new XmlRpcCoordinator({
		gateway: gateway as unknown as XmlRpcGateway,
		sessionStorage: storage,
		minimumInterval: 0,
	});

describe('XmlRpcCoordinator', () => {
	it('requires client credentials before the first call', async () => {
		await expect(coordinator(fakeGateway()).call('test.ping')).rejects.toThrow(/client\.login\(\)/);
	});

	it('logs in lazily on first use, once, and saves the session', async () => {
		const gateway = fakeGateway();
		const storage = memoryStorage();
		const xmlrpc = coordinator(gateway, storage);
		xmlrpc._setCredentials('Me', 'secret');

		expect(gateway.login).not.toHaveBeenCalled();
		await Promise.all([xmlrpc.call('a'), xmlrpc.call('b'), xmlrpc.authorizeProducts([1])]);

		expect(gateway.login).toHaveBeenCalledTimes(1);
		expect(gateway.login).toHaveBeenCalledWith({ username: 'Me', password: 'secret' });
		expect(JSON.parse(storage.saved!)).toEqual({ username: 'Me', session: issued });
	});

	it('reuses a saved session for the same user instead of logging in', async () => {
		const gateway = fakeGateway();
		const xmlrpc = coordinator(gateway, memoryStorage(JSON.stringify({ username: 'me', session: issued })));
		xmlrpc._setCredentials('Me', 'secret');

		await xmlrpc.call('test.ping');

		expect(gateway.login).not.toHaveBeenCalled();
		expect(gateway.session).toEqual(issued);
	});

	it("ignores another user's or an unreadable saved session", async () => {
		for (const saved of [JSON.stringify({ username: 'Someone', session: issued }), 'not json']) {
			const gateway = fakeGateway();
			const xmlrpc = coordinator(gateway, memoryStorage(saved));
			xmlrpc._setCredentials('Me', 'secret');

			await xmlrpc.call('test.ping');

			expect(gateway.login).toHaveBeenCalledTimes(1);
		}
	});

	it('logs in again once when the server reports the session invalid', async () => {
		let calls = 0;
		const gateway = fakeGateway(async () => {
			calls++;
			if (calls === 1) throw new XmlRpcFault(FaultCode.InvalidAuthData, 'invalid authorization data');
			return 'ok';
		});
		const xmlrpc = coordinator(gateway, memoryStorage(JSON.stringify({ username: 'Me', session: issued })));
		xmlrpc._setCredentials('Me', 'secret');

		await expect(xmlrpc.call('test.ping')).resolves.toBe('ok');

		expect(gateway.login).toHaveBeenCalledTimes(1);
		expect(gateway.call).toHaveBeenCalledTimes(2);
	});

	it('does not retry other faults', async () => {
		const gateway = fakeGateway(async () => {
			throw new XmlRpcFault(-32601, 'unknown method');
		});
		const xmlrpc = coordinator(gateway);
		xmlrpc._setCredentials('Me', 'secret');

		await expect(xmlrpc.call('test.nope')).rejects.toMatchObject({ code: -32601 });
		expect(gateway.call).toHaveBeenCalledTimes(1);
	});

	it('paces calls to the minimum interval', async () => {
		const started: number[] = [];
		const gateway = fakeGateway(async () => void started.push(Date.now()));
		const xmlrpc = new XmlRpcCoordinator({
			gateway: gateway as unknown as XmlRpcGateway,
			sessionStorage: null,
			minimumInterval: 40,
		});
		xmlrpc._setCredentials('Me', 'secret');

		await Promise.all([xmlrpc.call('a'), xmlrpc.call('b'), xmlrpc.call('c')]);

		expect(started).toHaveLength(3);
		expect(started[1] - started[0]).toBeGreaterThanOrEqual(35);
		expect(started[2] - started[1]).toBeGreaterThanOrEqual(35);
	});

	it('drops the in-memory session on logout and when the user changes', async () => {
		const gateway = fakeGateway();
		const xmlrpc = coordinator(gateway);
		xmlrpc._setCredentials('Me', 'secret');
		await xmlrpc.call('a');

		xmlrpc._setCredentials('Other', 'pw');
		expect(gateway.session).toBeUndefined();

		await xmlrpc.call('b');
		xmlrpc._clear();
		expect(gateway.session).toBeUndefined();
		await expect(xmlrpc.call('c')).rejects.toThrow(/client\.login\(\)/);
	});
});
