import { EventEmitter } from 'node:events';

import type {
	ChatMessage,
	ChatParticipant,
	ChatSession,
	ChatSessionCloseReason,
	Client,
	JoinOptions,
	ParticipantChange,
	ParticipantLeave,
	Room,
} from '@imvu/client';

import { parseCommand } from './parse.js';
import { RateLimiter, type RateLimit } from './RateLimiter.js';

/** Who may run a command, lowest to highest. Each level includes the ones below it. */
export type Role = 'everyone' | 'moderator' | 'owner' | 'admin';
const RANK: Record<Role, number> = { everyone: 0, moderator: 1, owner: 2, admin: 3 };

export interface BotOptions {
	client: Client;
	/** Command prefix. Default `!`. */
	prefix?: string;
	/** Bot operators: allowed every command in every room. */
	admins?: Array<string | number>;
	/** Outgoing chat budget per room. Default 3 messages per 5 s. */
	rateLimit?: RateLimit;
	/** Lines allowed to wait for the rate limit before new ones are rejected. Default 20. */
	maxQueue?: number;
	/**
	 * Rejoin when the server drops the bot (expired presence, network). Default `true`.
	 * `afterBoot` also rejoins after being booted (default `false`; staying out is polite).
	 */
	rejoin?: boolean | { afterBoot?: boolean; delays?: number[] };
	/** Register a built-in `help` command. Default `true`. */
	help?: boolean;
	/** How long a room's moderator list is trusted before re-reading it. Default 5 min. */
	moderatorCacheMs?: number;
	/** Passed to every `room.join()`. */
	join?: JoinOptions;
}

export interface CommandOptions {
	description?: string;
	/** Shown by `help <command>`, e.g. `<user> [reason]`. */
	usage?: string;
	aliases?: string[];
	/** Minimum role, or a custom check. Default `'everyone'`. */
	permission?: Role | ((context: CommandContext) => boolean | Promise<boolean>);
	/** Per-user cooldown in milliseconds. */
	cooldown?: number;
}

export type CommandHandler = (context: CommandContext) => void | Promise<void>;
export type Middleware = (context: CommandContext, next: () => Promise<void>) => void | Promise<void>;

export interface CommandContext {
	bot: Bot;
	room: BotRoom;
	message: ChatMessage;
	/** The sender's cid. */
	userId: string;
	/** The canonical command name (not the alias that was typed). */
	command: string;
	args: string[];
	argText: string;
	role: Role;
	/** Answer in kind: a whisper gets a whisper back, public chat a public reply. */
	reply(text: string): Promise<void>;
	/** Whisper the sender. */
	whisper(text: string): Promise<void>;
}

interface Command {
	name: string;
	options: CommandOptions;
	handler: CommandHandler;
}

export interface BotEvents {
	ready: [room: BotRoom];
	message: [room: BotRoom, message: ChatMessage];
	join: [room: BotRoom, participant: ChatParticipant];
	leave: [room: BotRoom, event: ParticipantLeave];
	update: [room: BotRoom, participant: ChatParticipant, changes: ParticipantChange[]];
	outfit: [room: BotRoom, event: { userId: string; productIds: string[] }];
	booted: [room: BotRoom, event: { by: string }];
	/** The bot is out of the room for good (left, booted, or rejoining failed). */
	closed: [room: BotRoom, reason: ChatSessionCloseReason];
	rejoined: [room: BotRoom];
	/** A command was refused for lack of permission. */
	denied: [context: CommandContext];
	commandError: [error: Error, context: CommandContext];
	error: [error: Error, room?: BotRoom];
}

/** One room the bot is in. Survives rejoins: `session` is replaced, the BotRoom is not. */
export class BotRoom {
	readonly #limiter: RateLimiter;
	#moderators?: { ids: Set<string>; at: number };
	#ownerId?: string;

	public constructor(
		private readonly bot: Bot,
		public readonly room: Room,
		public session: ChatSession,
		limit: RateLimit,
		maxQueue: number
	) {
		this.#limiter = new RateLimiter(limit, maxQueue);
		Object.defineProperty(this, 'bot', { enumerable: false });
	}

	public get id(): string {
		return this.room.id;
	}

	public get participants(): ChatParticipant[] {
		return this.session.participants;
	}

	/** Say something in public chat (rate limited). */
	public say(text: string): Promise<void> {
		return this.#limiter.schedule(() => this.session.send(text));
	}

	/** Whisper one participant (rate limited). */
	public whisper(userId: string | number, text: string): Promise<void> {
		return this.#limiter.schedule(() => this.session.whisper(userId, text));
	}

	/** Boot a participant. Needs owner or moderator rights in the room. */
	public boot(userId: string | number): Promise<void> {
		return this.#limiter.schedule(() => this.session.boot(userId));
	}

	/** The highest role `userId` holds here. */
	public async roleOf(userId: string | number): Promise<Role> {
		const id = String(userId);
		if (this.bot.isAdmin(id)) return 'admin';
		if (id === (await this.ownerId())) return 'owner';
		if ((await this.moderatorIds()).has(id)) return 'moderator';
		return 'everyone';
	}

	public leave(): Promise<void> {
		return this.bot.leave(this.id);
	}

	/** @internal */
	public _stop(): void {
		this.#limiter.stop();
	}

	private async ownerId(): Promise<string> {
		if (this.#ownerId === undefined) {
			const owner = this.room.relations.owner;
			this.#ownerId = owner ? await this.bot.client.utils.id(owner) : '';
		}
		return this.#ownerId;
	}

	private async moderatorIds(): Promise<Set<string>> {
		const cached = this.#moderators;
		if (cached && Date.now() - cached.at < this.bot.moderatorCacheMs) return cached.ids;

		const moderators = await this.room.moderators().catch(() => []);
		const ids = new Set(moderators.map((user) => user.id));
		this.#moderators = { ids, at: Date.now() };
		return ids;
	}
}

/**
 * A chat bot: joins rooms, routes `!commands` to handlers with permissions, cooldowns
 * and middleware, rate-limits what it says, and rejoins when the server drops it.
 *
 * ```ts
 * const bot = new Bot({ client, admins: [myCid] });
 * bot.command('ping', { description: 'Check the bot is alive' }, (ctx) => ctx.reply('pong'));
 * await bot.join('123456-1');
 * ```
 */
export class Bot extends EventEmitter<BotEvents> {
	public readonly client: Client;
	public readonly prefix: string;
	/** @internal */
	public readonly moderatorCacheMs: number;

	readonly #rooms = new Map<string, BotRoom>();
	readonly #commands = new Map<string, Command>();
	readonly #aliases = new Map<string, string>();
	readonly #middleware: Middleware[] = [];
	readonly #cooldowns = new Map<string, number>();
	readonly #dispatch = new WeakMap<BotRoom, Promise<void>>();
	readonly #admins: Set<string>;
	readonly #options: BotOptions;

	public constructor(options: BotOptions) {
		super();
		this.client = options.client;
		this.prefix = options.prefix ?? '!';
		this.moderatorCacheMs = options.moderatorCacheMs ?? 5 * 60_000;
		this.#admins = new Set((options.admins ?? []).map(String));
		this.#options = options;

		if (options.help ?? true) {
			this.command('help', { description: 'List commands, or explain one', usage: '[command]' }, (context) =>
				this.help(context)
			);
		}
	}

	public get rooms(): BotRoom[] {
		return [...this.#rooms.values()];
	}

	public isAdmin(userId: string | number): boolean {
		return this.#admins.has(String(userId));
	}

	public command(name: string, handler: CommandHandler): this;
	public command(name: string, options: CommandOptions, handler: CommandHandler): this;
	public command(name: string, optionsOrHandler: CommandOptions | CommandHandler, maybeHandler?: CommandHandler): this {
		const options = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
		const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler!;
		const key = name.toLowerCase();

		this.#commands.set(key, { name: key, options, handler });
		for (const alias of options.aliases ?? []) this.#aliases.set(alias.toLowerCase(), key);
		return this;
	}

	/** Run `middleware` before every command handler; call `next()` to continue. */
	public use(middleware: Middleware): this {
		this.#middleware.push(middleware);
		return this;
	}

	/** Join a room by id (e.g. `'123456-1'`) or {@link Room}. Joining twice returns the same room. */
	public async join(target: Room | string): Promise<BotRoom> {
		const room = typeof target === 'string' ? await this.client.rooms.fetch(target) : target;
		if (!room) throw new Error(`Room '${typeof target === 'string' ? target : target.id}' was not found`);

		const existing = this.#rooms.get(room.id);
		if (existing) return existing;

		const session = await room.join(this.#options.join);
		const botRoom = new BotRoom(
			this,
			room,
			session,
			this.#options.rateLimit ?? { messages: 3, perMs: 5_000 },
			this.#options.maxQueue ?? 20
		);
		this.#rooms.set(room.id, botRoom);
		this.attach(botRoom, session);
		this.emit('ready', botRoom);
		return botRoom;
	}

	public async leave(roomId: string): Promise<void> {
		const botRoom = this.#rooms.get(roomId);
		if (!botRoom) return;
		this.#rooms.delete(roomId);
		botRoom._stop();
		await botRoom.session.leave();
	}

	/** Leave every room. */
	public async stop(): Promise<void> {
		await Promise.all(this.rooms.map((room) => this.leave(room.id)));
	}

	private attach(botRoom: BotRoom, session: ChatSession): void {
		session.on('message', (message) => this.enqueue(botRoom, message));
		session.on('join', (participant) => this.emit('join', botRoom, participant));
		session.on('leave', (event) => this.emit('leave', botRoom, event));
		session.on('update', (participant, changes) => this.emit('update', botRoom, participant, changes));
		session.on('outfit', (event) => this.emit('outfit', botRoom, event));
		session.on('booted', (event) => this.emit('booted', botRoom, event));
		session.on('error', (error) => this.emitError(error, botRoom));
		session.on('close', ({ reason }) => void this.onClose(botRoom, reason));
	}

	private async onClose(botRoom: BotRoom, reason: ChatSessionCloseReason): Promise<void> {
		// We left on purpose (leave() already removed it), or another BotRoom took its place.
		if (this.#rooms.get(botRoom.id) !== botRoom) return;

		const rejoin = this.#options.rejoin ?? true;
		const settings = typeof rejoin === 'object' ? rejoin : {};
		const allowed = rejoin !== false && (reason === 'removed' || (reason === 'booted' && settings.afterBoot === true));

		if (allowed) {
			for (const delay of settings.delays ?? [5_000, 15_000, 60_000]) {
				await new Promise((resolve) => setTimeout(resolve, delay));
				if (this.#rooms.get(botRoom.id) !== botRoom) return;
				try {
					const session = await botRoom.room.join(this.#options.join);
					botRoom.session = session;
					this.attach(botRoom, session);
					this.emit('rejoined', botRoom);
					return;
				} catch (error) {
					this.emitError(error as Error, botRoom);
				}
			}
		}

		this.#rooms.delete(botRoom.id);
		botRoom._stop();
		this.emit('closed', botRoom, reason);
	}

	/**
	 * Commands are recognised in arrival order per room (role lookups are async), then
	 * each handler runs on its own so a slow command does not hold up the next one.
	 */
	private enqueue(room: BotRoom, message: ChatMessage): void {
		const previous = this.#dispatch.get(room) ?? Promise.resolve();
		this.#dispatch.set(
			room,
			previous.then(() => this.onMessage(room, message))
		);
	}

	private async onMessage(room: BotRoom, message: ChatMessage): Promise<void> {
		// Whispers between other people are not for us.
		if (message.whisper && !message.toMe) return;
		this.emit('message', room, message);

		const parsed = parseCommand(message.text, this.prefix);
		if (!parsed) return;
		const command = this.#commands.get(this.#aliases.get(parsed.name) ?? parsed.name);
		if (!command) return;

		try {
			const role = await room.roleOf(message.userId);
			const context: CommandContext = {
				bot: this,
				room,
				message,
				userId: message.userId,
				command: command.name,
				args: parsed.args,
				argText: parsed.argText,
				role,
				reply: (text) => (message.toMe ? room.whisper(message.userId, text) : room.say(text)),
				whisper: (text) => room.whisper(message.userId, text),
			};

			if (!(await this.permitted(command, context))) {
				this.emit('denied', context);
				return;
			}
			if (this.coolingDown(command, context)) return;

			void this.run(command, context);
		} catch (error) {
			this.emitError(error as Error, room);
		}
	}

	private async run(command: Command, context: CommandContext): Promise<void> {
		const step = async (index: number): Promise<void> => {
			const middleware = this.#middleware[index];
			if (middleware) await middleware(context, () => step(index + 1));
			else await command.handler(context);
		};
		try {
			await step(0);
		} catch (error) {
			if (this.listenerCount('commandError') > 0) this.emit('commandError', error as Error, context);
			else this.emitError(error as Error, context.room);
		}
	}

	private async permitted(command: Command, context: CommandContext): Promise<boolean> {
		const permission = command.options.permission ?? 'everyone';
		if (typeof permission === 'function') return permission(context);
		return RANK[context.role] >= RANK[permission];
	}

	private coolingDown(command: Command, context: CommandContext): boolean {
		const cooldown = command.options.cooldown;
		if (!cooldown || context.role === 'admin') return false;

		const key = `${context.room.id}\0${command.name}\0${context.userId}`;
		const now = Date.now();
		const last = this.#cooldowns.get(key);
		if (last !== undefined && now - last < cooldown) return true;
		this.#cooldowns.set(key, now);
		return false;
	}

	private async help(context: CommandContext): Promise<void> {
		const name = context.args[0]?.replace(this.prefix, '').toLowerCase();
		if (name) {
			const command = this.#commands.get(this.#aliases.get(name) ?? name);
			if (!command) return context.reply(`No command "${name}".`);
			const usage = command.options.usage ? ` ${command.options.usage}` : '';
			const description = command.options.description ? ` — ${command.options.description}` : '';
			return context.reply(`${this.prefix}${command.name}${usage}${description}`);
		}

		const visible: string[] = [];
		for (const command of this.#commands.values()) {
			const permission = command.options.permission ?? 'everyone';
			if (typeof permission === 'string' && RANK[context.role] < RANK[permission]) continue;
			visible.push(`${this.prefix}${command.name}`);
		}
		return context.reply(`Commands: ${visible.join(', ')}`);
	}

	private emitError(error: Error, room?: BotRoom): void {
		if (this.listenerCount('error') > 0) this.emit('error', error, room);
	}
}
