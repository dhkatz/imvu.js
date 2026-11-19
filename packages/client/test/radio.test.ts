import { REST } from '@imvu/rest';

import { Client, Room, RoomRadio } from '../src/index.js';

const API = 'https://api.imvu.com';
const ROOM = `${API}/room/room-100-7`;
const EXPERIENCE = `${API}/experience/experience-555`;
const PLAYERS = `${EXPERIENCE}/media_players`;
const PLAYER = `${API}/media_player/media_player-100-9`;

interface Sent {
	method: string;
	url: string;
	body: unknown;
}

/** IMVU's wire envelopes for a room with a radio, as the API returns them (2026-11-19). */
function harness(options: { experience?: boolean } = {}) {
	const state = { station_name: '', station_url: 'https://radio.example/a', status: 'stopped' };
	const sent: Sent[] = [];
	const envelope = (id: string, denormalized: Record<string, unknown>) => ({
		status: 'success',
		id,
		denormalized,
		http: {},
	});
	const player = () => ({
		data: { type: { provider: 'web_radio', format: 'radio', output: 'audio' }, current_state: { ...state } },
		relations: { targets: `${PLAYER}/targets` },
		updates: { queue: 'inv:/media_player/media_player-100-9', mount: 'node' },
	});
	const documents: Record<string, () => unknown> = {
		[ROOM]: () =>
			envelope(ROOM, {
				[ROOM]: {
					data: { name: 'Room', supports_audience: false },
					relations: {
						chat: `${API}/chat/chat-100-7`,
						...(options.experience === false ? {} : { media_experience: EXPERIENCE }),
					},
					updates: null,
				},
			}),
		[EXPERIENCE]: () =>
			envelope(EXPERIENCE, {
				[EXPERIENCE]: {
					data: { type: 4, queue: null },
					relations: { room: ROOM, media_players: PLAYERS },
					updates: null,
				},
			}),
		[PLAYERS]: () =>
			envelope(PLAYERS, {
				[PLAYER]: player(),
				[`${PLAYERS}/media_player-100-9`]: { data: {}, relations: { ref: PLAYER }, updates: null },
				[PLAYERS]: {
					data: { items: [`${PLAYERS}/media_player-100-9`], total_count: 1 },
					relations: [],
					updates: { queue: 'inv:/experience/experience-555', mount: 'edge:media_players' },
				},
			}),
		[PLAYER]: () => envelope(PLAYER, { [PLAYER]: player() }),
	};

	const fetch = (async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		sent.push({ method, url, body });
		if (method === 'POST' && url === PLAYER) {
			if (body.action === 'update_radio')
				Object.assign(state, { station_url: body.station_url, station_name: body.station_name });
			if (body.action === 'start_radio') state.status = 'playing';
			if (body.action === 'stop_radio') state.status = 'stopped';
			return Response.json(envelope(PLAYER, { [PLAYER]: player() }));
		}
		const document = documents[url];
		if (!document) return Response.json({ status: 'failure', error: 'NOT-FOUND', message: url }, { status: 404 });
		return Response.json(document());
	}) as typeof globalThis.fetch;

	const client = new Client(new REST({ fetch, cookieStorage: null }));
	return { client, sent, state };
}

describe('Room.radio', () => {
	it('finds the web_radio player through the media experience', async () => {
		const { client } = harness();
		const room = await client.resource(ROOM, Room);
		const radio = await room.radio();

		expect(radio).toBeInstanceOf(RoomRadio);
		expect(radio?.url).toBe(PLAYER);
		expect(radio?.provider).toBe('web_radio');
		expect(radio?.stationUrl).toBe('https://radio.example/a');
		expect(radio?.status).toBe('stopped');
		expect(radio?.playing).toBe(false);
	});

	it('is null for a room without a media experience', async () => {
		const { client } = harness({ experience: false });
		const room = await client.resource(ROOM, Room);

		await expect(room.radio()).resolves.toBeNull();
	});

	it('sets the station, then turns it on and off, as IMVU’s client does', async () => {
		const { client, sent } = harness();
		const radio = (await (await client.resource(ROOM, Room)).radio())!;

		await radio.setStation('https://radio.example/b', 'B');
		expect(radio.stationUrl).toBe('https://radio.example/b');
		expect(radio.stationName).toBe('B');
		expect(radio.playing).toBe(false);

		await radio.start();
		expect(radio.playing).toBe(true);
		await radio.stop();
		expect(radio.status).toBe('stopped');

		expect(sent.filter((request) => request.method === 'POST')).toEqual([
			{
				method: 'POST',
				url: PLAYER,
				body: { action: 'update_radio', station_url: 'https://radio.example/b', station_name: 'B' },
			},
			{ method: 'POST', url: PLAYER, body: { action: 'start_radio' } },
			{ method: 'POST', url: PLAYER, body: { action: 'stop_radio' } },
		]);
	});

	it('keeps one instance per player, so earlier references see changes', async () => {
		const { client } = harness();
		const room = await client.resource(ROOM, Room);
		const first = (await room.radio())!;
		const second = (await room.radio())!;
		expect(second).toBe(first);

		await second.start();
		expect(first.playing).toBe(true);
	});
});
