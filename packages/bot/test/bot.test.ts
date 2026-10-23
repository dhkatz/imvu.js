import { EventEmitter } from 'node:events';

import type { ChatMessage, ChatSession, Client, Room } from '@imvu/client';

import { Bot, RateLimiter, parseCommand, type BotOptions } from '../src/index.js';

class FakeSession extends EventEmitter {
	public readonly said: string[] = [];
	public readonly whispered: Array<[string, string]> = [];
	public readonly booted: string[] = [];
	public participants = [];
	public closed = false;
	public userId = '1';
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
		const message: Partial<ChatMessage> = { userId, text, to, whisper: to !== 0, toMe: to === 1, action: false };
		this.emit('message', message);
	}
}

const OWNER = '100';
const MOD = '200';

function setup(options: Partial<BotOptions> = {}) {
	const sessions: FakeSession[] = [];
	const join = vi.fn(async () => {
		const session = new FakeSession();
		sessions.push(session);
		return session as unknown as ChatSession;
	});
	const room = {
		id: '100-1',
		relations: { owner: `https://api.imvu.com/user/user-${OWNER}` },
		moderators: vi.fn(async () => [{ id: MOD }]),
		join,
	} as unknown as Room;
	const client = {
		rooms: { fetch: vi.fn(async () => room) },
		utils: { id: async (url: string) => url.split('user-')[1] },
	} as unknown as Client;
	const bot = new Bot({ client, rateLimit: { messages: 100, perMs: 1000 }, ...options });
	return { bot, join, sessions, session: () => sessions.at(-1)! };
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

		for (const user of ['5', MOD, OWNER, '9']) session().hear(user, '!mod');
		session().hear(MOD, '!own');
		await settle();

		expect(session().said).toEqual(['ok moderator', 'ok owner', 'ok admin']);
		expect(denied).toHaveBeenCalledTimes(2);
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
	it('joins once per room and leaves cleanly', async () => {
		const { bot, join } = setup();
		const closed = vi.fn();
		bot.on('closed', closed);

		const first = await bot.join('100-1');
		expect(await bot.join('100-1')).toBe(first);
		expect(join).toHaveBeenCalledTimes(1);

		await bot.stop();
		expect(bot.rooms).toEqual([]);
		expect(closed).not.toHaveBeenCalled();
	});

	it('rejoins after the server drops it, but not after a boot', async () => {
		const { bot, join, sessions } = setup({ rejoin: { delays: [0] } });
		const rejoined = vi.fn();
		const closed = vi.fn();
		bot.on('rejoined', rejoined);
		bot.on('closed', closed);
		bot.command('ping', (ctx) => ctx.reply('pong'));
		const botRoom = await bot.join('100-1');

		sessions[0].close('removed');
		await vi.waitFor(() => expect(rejoined).toHaveBeenCalled());
		expect(join).toHaveBeenCalledTimes(2);
		expect(botRoom.session).toBe(sessions[1]);

		sessions[1].hear('5', '!ping');
		await settle();
		expect(sessions[1].said).toEqual(['pong']);

		sessions[1].close('booted');
		await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(botRoom, 'booted'));
		expect(join).toHaveBeenCalledTimes(2);
		expect(bot.rooms).toEqual([]);
	});

	it('rate-limits what it says per room', async () => {
		vi.useFakeTimers();
		try {
			const { bot, session } = setup({ rateLimit: { messages: 1, perMs: 1000 } });
			const room = await bot.join('100-1');

			const sends = [room.say('a'), room.say('b')];
			await vi.advanceTimersByTimeAsync(0);
			expect(session().said).toEqual(['a']);
			await vi.advanceTimersByTimeAsync(1000);
			expect(session().said).toEqual(['a', 'b']);
			await Promise.all(sends);
		} finally {
			vi.useRealTimers();
		}
	});
});
