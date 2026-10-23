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
	User,
} from '@imvu/client';

import { parseCommand } from './parse.js';
import { RateLimiter, type RateLimit } from './RateLimiter.js';

/** Who may run a command, lowest to highest. Each level includes the ones below it. */
export type Role = 'everyone' | 'moderator' | 'owner' | 'admin';
const RANK: Record<Role, number> = { everyone: 0, moderator: 1, owner: 2, admin: 3 };

/**
 * Where a message came from. Rooms today; IM conversations will join this union, so
 * check `source.type` rather than assuming a room.
 */
export type MessageSource = BotRoom;
export type SourceType = MessageSource['type'];

export interface BotOptions {
	client: Client;
	/** Command prefix. Default `!`. */
	prefix?: string;
	/** Bot operators: allowed every command everywhere. */
	admins?: Array<string | number>;
	/** Outgoing chat budget per room. Default 3 lines per 5 s. */
	rateLimit?: RateLimit;
	/** Outgoing chat budget for the whole account, across all rooms. Default 20 lines per 10 s. */
	globalRateLimit?: RateLimit;
	/** Lines allowed to wait for a room's rate limit before new ones are rejected. Default 20. */
	maxQueue?: number;
	/** Pause between room joins, so joining hundreds of rooms doesn't burst. Default 1.5 s. */
	joinInterval?: number;
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

/** A chat line the bot received, with its author resolved. */
export interface BotMessage {
	text: string;
	/** The sender. Resolved from the cache (participant reads embed users), fetched only on a miss. */
	author: User;
	/** The sender's presence in the room; null when not (yet) known, and for IMs. */
	participant: ChatParticipant | null;
	source: MessageSource;
	/** `/me …` narration. */
	action: boolean;
	/** Whispered to the bot rather than said publicly. */
	whisper: boolean;
	receivedAt: Date;
	/** The underlying chat message. */
	raw: ChatMessage;
	/** Answer in kind: a whisper gets a whisper back, public chat a public reply. */
	reply(text: string): Promise<void>;
}

export interface CommandOptions {
	description?: string;
	/** Shown by `help <command>`, e.g. `<user> [reason]`. */
	usage?: string;
	aliases?: string[];
	/** Minimum role, or a custom check. Default `'everyone'`. */
	permission?: Role | ((context: CommandContext) => boolean | Promise<boolean>);
	/** Per-user cooldown in milliseconds (per source). */
	cooldown?: number;
	/** Where the command may run. Default: everywhere. */
	sources?: SourceType[];
}

export type CommandHandler = (context: CommandContext) => void | Promise<void>;
export type Middleware = (context: CommandContext, next: () => Promise<void>) => void | Promise<void>;

export interface CommandContext {
	bot: Bot;
	message: BotMessage;
	source: MessageSource;
	author: User;
	participant: ChatParticipant | null;
	/** The canonical command name (not the alias that was typed). */
	command: string;
	args: string[];
	argText: string;
	/** The author's role in this source. */
	role: Role;
	reply(text: string): Promise<void>;
	/** Whisper the author. */
	whisper(text: string): Promise<void>;
}

interface Command {
	name: string;
	options: CommandOptions;
	handler: CommandHandler;
}

export interface JoinFailure {
	target: Room | string;
	error: Error;
}

export interface BotEvents {
	message: [message: BotMessage];
	roomJoin: [room: BotRoom];
	/** The bot is out of the room for good (booted, or rejoining failed). Not emitted for `leave()`. */
	roomLeave: [room: BotRoom, reason: ChatSessionCloseReason];
	roomRejoin: [room: BotRoom];
	booted: [room: BotRoom, by: string];
	participantJoin: [participant: ChatParticipant, room: BotRoom];
	participantLeave: [event: ParticipantLeave, room: BotRoom];
	participantUpdate: [participant: ChatParticipant, changes: ParticipantChange[], room: BotRoom];
	/** A command was refused for lack of permission. */
	denied: [context: CommandContext];
	commandError: [error: Error, context: CommandContext];
	error: [error: Error, source?: MessageSource];
}

/** One room the bot is in (the IMVU counterpart of a discord.js guild). Survives rejoins. */
export class BotRoom {
	public readonly type = 'room' as const;
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

	public get name(): string {
		return this.room.name;
	}

	/** Everyone present, by user id (the counterpart of `guild.members.cache`). */
	public get participants(): ReadonlyMap<string, ChatParticipant> {
		return new Map(this.session.participants.map((participant) => [participant.userId, participant]));
	}

	public participant(userId: string | number): ChatParticipant | undefined {
		return this.session.participant(userId);
	}

	/** Say something in public chat (rate limited per room and per account). */
	public say(text: string): Promise<void> {
		return this.#limiter.schedule(() => this.bot._send(() => this.session.send(text)));
	}

	/** Whisper one participant (rate limited). */
	public whisper(userId: string | number, text: string): Promise<void> {
		return this.#limiter.schedule(() => this.bot._send(() => this.session.whisper(userId, text)));
	}

	/** Boot a participant. Needs owner or moderator rights in the room. */
	public boot(userId: string | number): Promise<void> {
		return this.#limiter.schedule(() => this.bot._send(() => this.session.boot(userId)));
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
 * A chat bot for any number of rooms: routes `!commands` to handlers with permissions,
 * cooldowns and middleware, rate-limits what it says per room and per account, paces
 * its joins, and rejoins when the server drops it.
 *
 * ```ts
 * const bot = new Bot({ client, admins: [myCid] });
 * bot.command('ping', (ctx) => ctx.reply('pong'));
 * await bot.joinAll(roomIds);
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
	readonly #dispatch = new WeakMap<MessageSource, Promise<void>>();
	readonly #admins: Set<string>;
	readonly #options: BotOptions;
	readonly #global: RateLimiter;
	readonly #joining = new Map<string, Promise<BotRoom>>();
	#joinQueue: Promise<unknown> = Promise.resolve();
	#lastJoinAt = 0;

	public constructor(options: BotOptions) {
		super();
		this.client = options.client;
		this.prefix = options.prefix ?? '!';
		this.moderatorCacheMs = options.moderatorCacheMs ?? 5 * 60_000;
		this.#admins = new Set((options.admins ?? []).map(String));
		this.#options = options;
		this.#global = new RateLimiter(options.globalRateLimit ?? { messages: 20, perMs: 10_000 }, Infinity);

		if (options.help ?? true) {
			this.command('help', { description: 'List commands, or explain one', usage: '[command]' }, (context) =>
				this.help(context)
			);
		}
	}

	/** The rooms the bot is in, by room id (the counterpart of `client.guilds.cache`). */
	public get rooms(): ReadonlyMap<string, BotRoom> {
		return this.#rooms;
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

	/**
	 * Join a room by id (e.g. `'123456-1'`) or {@link Room}. Joins are paced by
	 * `joinInterval`; joining a room the bot is in (or joining) returns that room.
	 */
	public join(target: Room | string): Promise<BotRoom> {
		const key = typeof target === 'string' ? target : target.id;
		const existing = this.#rooms.get(key);
		if (existing) return Promise.resolve(existing);

		let pending = this.#joining.get(key);
		if (!pending) {
			pending = this.paced(() => this.joinNow(target)).finally(() => this.#joining.delete(key));
			this.#joining.set(key, pending);
		}
		return pending;
	}

	/**
	 * Join many rooms, paced, without stopping at the first failure. Full rooms
	 * (`CHAT_PARTICIPANT-002`), private rooms and missing rooms end up in `failed`.
	 */
	public async joinAll(targets: Iterable<Room | string>): Promise<{ joined: BotRoom[]; failed: JoinFailure[] }> {
		const list = [...targets];
		const results = await Promise.allSettled(list.map((target) => this.join(target)));
		const joined: BotRoom[] = [];
		const failed: JoinFailure[] = [];
		results.forEach((result, index) => {
			if (result.status === 'fulfilled') joined.push(result.value);
			else failed.push({ target: list[index], error: result.reason as Error });
		});
		return { joined, failed };
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
		await Promise.all([...this.#rooms.keys()].map((id) => this.leave(id)));
		this.#global.stop();
	}

	/** @internal Every outgoing line passes the account-wide budget. */
	public _send(task: () => Promise<void>): Promise<void> {
		return this.#global.schedule(task);
	}

	private paced<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#joinQueue.then(async () => {
			const wait = this.#lastJoinAt + (this.#options.joinInterval ?? 1_500) - Date.now();
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
			this.#lastJoinAt = Date.now();
			return task();
		});
		this.#joinQueue = run.catch(() => {});
		return run;
	}

	private async joinNow(target: Room | string): Promise<BotRoom> {
		const room = typeof target === 'string' ? await this.client.rooms.fetch(target) : target;
		if (!room) throw new Error(`Room '${typeof target === 'string' ? target : target.id}' was not found`);

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
		this.emit('roomJoin', botRoom);
		return botRoom;
	}

	private attach(botRoom: BotRoom, session: ChatSession): void {
		session.on('message', (message) => this.enqueue(botRoom, message));
		session.on('join', (participant) => this.emit('participantJoin', participant, botRoom));
		session.on('leave', (event) => this.emit('participantLeave', event, botRoom));
		session.on('update', (participant, changes) => this.emit('participantUpdate', participant, changes, botRoom));
		session.on('booted', ({ by }) => this.emit('booted', botRoom, by));
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
					const session = await this.paced(() => botRoom.room.join(this.#options.join));
					botRoom.session = session;
					this.attach(botRoom, session);
					this.emit('roomRejoin', botRoom);
					return;
				} catch (error) {
					this.emitError(error as Error, botRoom);
					// A definite refusal (e.g. "Not authorized" after the room removed us) will not
					// change on retry; a full room might.
					const code = (error as { apiCode?: unknown }).apiCode;
					if (typeof code === 'string' && code !== 'CHAT_PARTICIPANT-002') break;
				}
			}
		}

		this.#rooms.delete(botRoom.id);
		botRoom._stop();
		this.emit('roomLeave', botRoom, reason);
	}

	/**
	 * Messages are handled in arrival order per source (author and role lookups are
	 * async), then each command handler runs on its own so a slow one doesn't hold up
	 * the next.
	 */
	private enqueue(source: MessageSource, raw: ChatMessage): void {
		// Whispers between other people are not for us.
		if (raw.whisper && !raw.toMe) return;
		const previous = this.#dispatch.get(source) ?? Promise.resolve();
		this.#dispatch.set(
			source,
			previous.then(() => this.onMessage(source, raw))
		);
	}

	private async onMessage(source: MessageSource, raw: ChatMessage): Promise<void> {
		try {
			const author = this.client.users.resolve(raw.userId) ?? (await this.client.users.fetch(raw.userId));
			if (!author) throw new Error(`Could not resolve the author ${raw.userId}`);

			const message: BotMessage = {
				text: raw.text,
				author,
				participant: source.participant(raw.userId) ?? null,
				source,
				action: raw.action,
				whisper: raw.whisper,
				receivedAt: raw.receivedAt,
				raw,
				reply: (text) => (raw.toMe ? source.whisper(raw.userId, text) : source.say(text)),
			};
			this.emit('message', message);
			await this.dispatchCommand(message);
		} catch (error) {
			this.emitError(error as Error, source);
		}
	}

	private async dispatchCommand(message: BotMessage): Promise<void> {
		const parsed = parseCommand(message.text, this.prefix);
		if (!parsed) return;
		const command = this.#commands.get(this.#aliases.get(parsed.name) ?? parsed.name);
		if (!command) return;
		if (command.options.sources && !command.options.sources.includes(message.source.type)) return;

		const context: CommandContext = {
			bot: this,
			message,
			source: message.source,
			author: message.author,
			participant: message.participant,
			command: command.name,
			args: parsed.args,
			argText: parsed.argText,
			role: await message.source.roleOf(message.author.id),
			reply: (text) => message.reply(text),
			whisper: (text) => message.source.whisper(message.author.id, text),
		};

		if (!(await this.permitted(command, context))) {
			this.emit('denied', context);
			return;
		}
		if (this.coolingDown(command, context)) return;

		void this.run(command, context);
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
			else this.emitError(error as Error, context.source);
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

		const key = `${context.source.type}:${context.source.id}\0${command.name}\0${context.author.id}`;
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
			if (command.options.sources && !command.options.sources.includes(context.source.type)) continue;
			const permission = command.options.permission ?? 'everyone';
			if (typeof permission === 'string' && RANK[context.role] < RANK[permission]) continue;
			visible.push(`${this.prefix}${command.name}`);
		}
		return context.reply(`Commands: ${visible.join(', ')}`);
	}

	private emitError(error: Error, source?: MessageSource): void {
		if (this.listenerCount('error') > 0) this.emit('error', error, source);
	}
}
