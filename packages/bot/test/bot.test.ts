import { EventEmitter } from 'node:events';

import type { ChatMessage, ChatParticipant, ChatSession, Client, Room } from '@imvu/client';

import { Bot, RateLimiter, parseCommand, type BotMessage, type BotOptions } from '../src/index.js';

class FakeSession extends EventEmitter {
	public readonly said: string[] = [];
	public readonly whispered: Array<[string, string]> = [];
	public readonly booted: string[] = [];
	public readonly present = new Map<string, ChatParticipant>();
	public closed = false;
	public userId = '1';
	public get participants(): ChatParticipant[] {
		return [...this.present.values()];
	}
	public participant(userId: string | number): ChatParticipant | undefined {
		return this.present.get(String(userId));
	}
	public async send(text: string): Promise<void> {
		this.said.push(text);
	}
	public async whisper(userId: string | number, text: string): Promise<void> {
		this.whispered.push([String(userId), text]);
	}
	public async boot(userId: string | number): Promise<void> {
		this.booted.push(String(userId));
	}
	public async leave(): Promise<void> {
		this.close('left');
	}
	public close(reason: string): void {
		if (this.closed) return;
		this.closed = true;
		this.emit('close', { reason });
		this.removeAllListeners();
	}
	public hear(userId: string, text: string, to = 0): void {
		const message: Partial<ChatMessage> = {
			userId,
			text,
			to,
			whisper: to !== 0,
			toMe: to === 1,
			action: false,
			receivedAt: new Date(),
		};
		this.emit('message', message);
	}
}

const OWNER = '100';
const MOD = '200';

const user = (id: string) => ({ id, username: `user${id}` });

function setup(options: Partial<BotOptions> = {}, roomIds = ['100-1']) {
	const sessions = new Map<string, FakeSession[]>();
	const rooms = new Map(
		roomIds.map((id) => {
			const join = vi.fn(async () => {
				if (id.startsWith('full')) throw Object.assign(new Error('full'), { apiCode: 'CHAT_PARTICIPANT-002' });
				const session = new FakeSession();
				session.present.set('5', { userId: '5' } as ChatParticipant);
				sessions.set(id, [...(sessions.get(id) ?? []), session]);
				return session as unknown as ChatSession;
			});
			const room = {
				id,
				name: `Room ${id}`,
				relations: { owner: `https://api.imvu.com/user/user-${OWNER}` },
				moderators: vi.fn(async () => [{ id: MOD }]),
				join,
			} as unknown as Room;
			return [id, { room, join }] as const;
		})
	);
	const cachedUsers = new Map<string, unknown>([['5', user('5')]]);
	const fetchUser = vi.fn(async (id: string) => user(id));
	const client = {
		rooms: { fetch: vi.fn(async (id: string) => rooms.get(id)?.room ?? null) },
		users: { resolve: (id: string) => cachedUsers.get(id), fetch: fetchUser },
		utils: { id: async (url: string) => url.split('user-')[1] },
	} as unknown as Client;
	const bot = new Bot({ client, rateLimit: { messages: 100, perMs: 1000 }, joinInterval: 0, ...options });
	const session = (id = roomIds[0]) => sessions.get(id)!.at(-1)!;
	return { bot, rooms, sessions, session, fetchUser, join: rooms.get(roomIds[0])!.join };
}

/** Let the bot's async message handling run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('parseCommand', () => {
	it('splits names and quoted arguments', () => {
		expect(parseCommand('!Play "Daft Punk" loud', '!')).toEqual({
			name: 'play',
			args: ['Daft Punk', 'loud'],
			argText: '"Daft Punk" loud',
		});
		expect(parseCommand("  !kick 'two words'  ", '!')?.args).toEqual(['two words']);
		expect(parseCommand('hello !ping', '!')).toBeNull();
		expect(parseCommand('!', '!')).toBeNull();
	});
});

describe('RateLimiter', () => {
	it('spaces tasks to the window and rejects once the queue is full', async () => {
		vi.useFakeTimers();
		try {
			const sent: number[] = [];
			const limiter = new RateLimiter({ messages: 2, perMs: 1000 }, 2);
			const send = (n: number) => limiter.schedule(async () => void sent.push(n));

			const first = [send(1), send(2), send(3), send(4)];
			await expect(send(5)).rejects.toThrow(/queue is full/);
			await vi.advanceTimersByTimeAsync(0);
			expect(sent).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(1000);
			expect(sent).toEqual([1, 2, 3, 4]);
			await Promise.all(first);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Bot messages', () => {
	it('resolves authors from the cache and fetches only on a miss', async () => {
		const { bot, session, fetchUser } = setup();
		const messages: BotMessage[] = [];
		bot.on('message', (message) => messages.push(message));
		await bot.join('100-1');

		session().hear('5', 'hello');
		session().hear('6', 'hi');
		await settle();

		expect(messages.map((m) => [m.author.id, m.participant?.userId ?? null, m.source.id])).toEqual([
			['5', '5', '100-1'],
			['6', null, '100-1'],
		]);
		expect(fetchUser).toHaveBeenCalledTimes(1);
		expect(fetchUser).toHaveBeenCalledWith('6');
	});
});

describe('Bot commands', () => {
	it('routes commands and aliases, and answers in kind', async () => {
		const { bot, session } = setup();
		bot.command('ping', { aliases: ['p'] }, (ctx) => ctx.reply(`pong ${ctx.args.join(',')}`));
		await bot.join('100-1');

		session().hear('5', '!ping a b');
		session().hear('5', '!P', 1); // whispered to the bot
		session().hear('5', '!ping', 7); // a whisper between others
		session().hear('5', 'just chatting');
		await settle();

		expect(session().said).toEqual(['pong a,b']);
		expect(session().whispered).toEqual([['5', 'pong ']]);
	});

	it('enforces roles from the room owner, moderators and admins', async () => {
		const { bot, session } = setup({ admins: [9] });
		const denied = vi.fn();
		bot.on('denied', denied);
		bot.command('mod', { permission: 'moderator' }, (ctx) => ctx.reply(`ok ${ctx.role}`));
		bot.command('own', { permission: 'owner' }, (ctx) => ctx.reply(`ok ${ctx.role}`));
		await bot.join('100-1');

		for (const id of ['5', MOD, OWNER, '9']) session().hear(id, '!mod');
		session().hear(MOD, '!own');
		await settle();

		expect(session().said).toEqual(['ok moderator', 'ok owner', 'ok admin']);
		expect(denied).toHaveBeenCalledTimes(2);
	});

	it('limits commands to the sources they declare', async () => {
		const { bot, session } = setup();
		bot.command('here', { sources: ['room'] }, (ctx) => ctx.reply(`in ${ctx.source.type} ${ctx.source.name}`));
		await bot.join('100-1');

		session().hear('5', '!here');
		await settle();

		expect(session().said).toEqual(['in room Room 100-1']);
	});

	it('applies per-user cooldowns and runs middleware in order', async () => {
		const { bot, session } = setup();
		const order: string[] = [];
		bot.use(async (ctx, next) => {
			order.push(`a:${ctx.command}`);
			await next();
		});
		bot.use((ctx, next) => (ctx.args[0] === 'block' ? undefined : next()));
		bot.command('roll', { cooldown: 60_000 }, (ctx) => {
			order.push('handler');
			return ctx.reply('rolled');
		});
		await bot.join('100-1');

		session().hear('5', '!roll block');
		await settle();
		session().hear('5', '!roll');
		session().hear('6', '!roll');
		await settle();

		// User 5's blocked attempt still started their cooldown; user 6 runs normally.
		expect(order).toEqual(['a:roll', 'a:roll', 'handler']);
		expect(session().said).toEqual(['rolled']);
	});

	it('reports handler errors', async () => {
		const { bot, session } = setup();
		const errors = vi.fn();
		bot.on('commandError', errors);
		bot.command('boom', () => {
			throw new Error('kaboom');
		});
		await bot.join('100-1');

		session().hear('5', '!boom');
		await settle();

		expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'kaboom' }), expect.anything());
	});

	it('lists and explains commands the user may run', async () => {
		const { bot, session } = setup();
		bot.command('ping', { description: 'Check the bot', usage: '[text]' }, () => {});
		bot.command('kick', { permission: 'moderator' }, () => {});
		await bot.join('100-1');

		session().hear('5', '!help');
		session().hear('5', '!help ping');
		session().hear(MOD, '!help');
		await settle();

		expect(session().said).toEqual([
			'Commands: !help, !ping',
			'!ping [text] — Check the bot',
			'Commands: !help, !ping, !kick',
		]);
	});
});

describe('Bot rooms', () => {
	it('joins many rooms, paced, and reports the ones it could not join', async () => {
		const { bot, rooms } = setup({ joinInterval: 20 }, ['1-1', '2-1', 'full-1', '3-1']);
		const started = Date.now();

		const { joined, failed } = await bot.joinAll(['1-1', '2-1', 'full-1', '3-1', 'missing-1', '1-1']);

		expect(joined.map((room) => room.id)).toEqual(['1-1', '2-1', '3-1', '1-1']);
		expect(failed.map((failure) => failure.target)).toEqual(['full-1', 'missing-1']);
		expect([...bot.rooms.keys()]).toEqual(['1-1', '2-1', '3-1']);
		expect(rooms.get('1-1')!.join).toHaveBeenCalledTimes(1);
		expect(Date.now() - started).toBeGreaterThanOrEqual(80);
	});

	it('routes each room’s messages to commands with that room as the source', async () => {
		const { bot, session } = setup({}, ['1-1', '2-1']);
		bot.command('where', (ctx) => ctx.reply(ctx.source.id));
		await bot.joinAll(['1-1', '2-1']);

		session('1-1').hear('5', '!where');
		session('2-1').hear('5', '!where');
		await settle();

		expect(session('1-1').said).toEqual(['1-1']);
		expect(session('2-1').said).toEqual(['2-1']);
	});

	it('joins once per room and leaves cleanly', async () => {
		const { bot, join } = setup();
		const left = vi.fn();
		bot.on('roomLeave', left);

		const first = await bot.join('100-1');
		expect(await bot.join('100-1')).toBe(first);
		expect(join).toHaveBeenCalledTimes(1);

		await bot.stop();
		expect(bot.rooms.size).toBe(0);
		expect(left).not.toHaveBeenCalled();
	});

	it('rejoins after the server drops it, but not after a boot', async () => {
		const { bot, join, sessions } = setup({ rejoin: { delays: [0] } });
		const rejoined = vi.fn();
		const left = vi.fn();
		bot.on('roomRejoin', rejoined);
		bot.on('roomLeave', left);
		bot.command('ping', (ctx) => ctx.reply('pong'));
		const botRoom = await bot.join('100-1');
		const [first] = sessions.get('100-1')!;

		first.close('removed');
		await vi.waitFor(() => expect(rejoined).toHaveBeenCalled());
		const second = sessions.get('100-1')![1];
		expect(join).toHaveBeenCalledTimes(2);
		expect(botRoom.session).toBe(second);

		second.hear('5', '!ping');
		await settle();
		expect(second.said).toEqual(['pong']);

		second.close('booted');
		await vi.waitFor(() => expect(left).toHaveBeenCalledWith(botRoom, 'booted'));
		expect(join).toHaveBeenCalledTimes(2);
		expect(bot.rooms.size).toBe(0);
	});

	it('stops rejoining when the API refuses outright', async () => {
		const { bot, join, sessions } = setup({ rejoin: { delays: [0, 0, 0] } });
		const left = vi.fn();
		bot.on('roomLeave', left);
		const botRoom = await bot.join('100-1');

		join.mockRejectedValueOnce(Object.assign(new Error('Not authorized for request'), { apiCode: 'AUTH-001' }));
		sessions.get('100-1')![0].close('removed');

		await vi.waitFor(() => expect(left).toHaveBeenCalledWith(botRoom, 'removed'));
		expect(join).toHaveBeenCalledTimes(2);
	});

	it('rate-limits per room and across the whole account', async () => {
		vi.useFakeTimers();
		try {
			const { bot, session } = setup(
				{ rateLimit: { messages: 2, perMs: 1000 }, globalRateLimit: { messages: 3, perMs: 1000 } },
				['1-1', '2-1']
			);
			const [one, two] = await Promise.all([bot.join('1-1'), bot.join('2-1')]);

			const sends = [one.say('a'), one.say('b'), one.say('c'), two.say('x'), two.say('y')];
			await vi.advanceTimersByTimeAsync(0);
			// Room 1 may send two now; the account allows three in total.
			expect([...session('1-1').said, ...session('2-1').said]).toHaveLength(3);
			expect(session('1-1').said).toEqual(['a', 'b']);
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);
			expect(session('1-1').said).toEqual(['a', 'b', 'c']);
			expect(session('2-1').said).toEqual(['x', 'y']);
			await Promise.all(sends);
		} finally {
			vi.useRealTimers();
		}
	});
});
