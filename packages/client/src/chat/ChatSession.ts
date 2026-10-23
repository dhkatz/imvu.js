import { EventEmitter } from 'node:events';

import { IMVUAPIError } from '@imvu/rest';

import type { Client } from '../client/Client.js';
import type { RealtimeMessage, RealtimeSubscription } from '../client/RealtimeCoordinator.js';
import type { Chat } from '../resources/Chat.js';
import type { ChatParticipant } from '../resources/ChatParticipant.js';
import { ChatObserver, type ObserveOptions, type ParticipantChange, type ParticipantLeave } from './ChatObserver.js';
import { encodeChatPayload, parseChatLine, parseChatPayload, type ChatPayload } from './protocol.js';

export interface JoinOptions extends ObserveOptions {
	/** How often to renew presence. The server drops silent participants after ~3.5–4 min. Default 45 s (as the web client). */
	keepAliveInterval?: number;
	/** Track who is present and emit `join`/`leave`/`update`. Default `true`. */
	observeParticipants?: boolean;
	/** Skip the echo of our own lines (the server sends them back). Default `true`. */
	ignoreOwnMessages?: boolean;
	/** Leave automatically when someone boots us. Default `true`. */
	leaveWhenBooted?: boolean;
}

export interface ChatMessage {
	/** Sender cid, from the IMQ envelope (trustworthy, unlike the payload's own `userId`). */
	userId: string;
	text: string;
	/** `/me …` narration. */
	action: boolean;
	/** `0` for public chat, otherwise the whisper recipient's cid. */
	to: number;
	whisper: boolean;
	/** A whisper addressed to us. */
	toMe: boolean;
	receivedAt: Date;
	payload: ChatPayload;
}

export type ChatSessionCloseReason = 'left' | 'booted' | 'removed';

export interface ChatSessionEvents {
	message: [message: ChatMessage];
	/** Someone announced their outfit (`*putOnOutfit`), avatar body first. */
	outfit: [event: { userId: string; productIds: string[] }];
	seat: [event: { userId: string; seatNumber: number; furniId: string }];
	/** Any other legacy `*` command. */
	command: [event: { userId: string; command: string; args: string[] }];
	/** Someone was booted (possibly us; see `booted`). */
	boot: [event: { booterId: string; targetId: string }];
	booted: [event: { by: string }];
	join: [participant: ChatParticipant];
	leave: [event: ParticipantLeave];
	update: [participant: ChatParticipant, changes: ParticipantChange[]];
	close: [event: { reason: ChatSessionCloseReason }];
	error: [error: Error];
}

/**
 * Presence in a classic room's chat as the logged-in account: send and receive chat,
 * follow participants, and stay in the room with keepalives until {@link leave}.
 */
export class ChatSession extends EventEmitter<ChatSessionEvents> {
	readonly #options: Required<Pick<JoinOptions, 'ignoreOwnMessages' | 'leaveWhenBooted'>>;
	#subscription?: RealtimeSubscription;
	#observer?: ChatObserver;
	#keepAlive?: ReturnType<typeof setInterval>;
	#closing?: Promise<void>;
	#booted = false;

	private constructor(
		private readonly client: Client,
		public readonly chat: Chat,
		/** Our own participant document URL. */
		public readonly participantUrl: string,
		options: JoinOptions
	) {
		super();
		this.#options = {
			ignoreOwnMessages: options.ignoreOwnMessages ?? true,
			leaveWhenBooted: options.leaveWhenBooted ?? true,
		};
		Object.defineProperty(this, 'client', { enumerable: false });
	}

	/** @internal Use {@link Chat.join}. */
	public static async join(client: Client, chat: Chat, options: JoinOptions = {}): Promise<ChatSession> {
		if (!client.authenticated) throw new Error('Joining a chat requires a logged-in client');
		if (!chat.imqQueue || !chat.relations.participants) await chat.refresh();

		const participants = chat.relations.participants ?? `${chat.url}/participants`;
		const response = await client.request(participants, { method: 'POST', data: {} });
		const participantUrl = response.id || `${participants}/user-${client.rest.cid}`;

		const session = new ChatSession(client, chat, participantUrl, options);
		try {
			await session.start(options);
		} catch (error) {
			await session.leave().catch(() => {});
			throw error;
		}
		return session;
	}

	/** Our own cid. */
	public get userId(): string {
		return String(this.client.rest.cid);
	}

	public get closed(): boolean {
		return this.#closing !== undefined;
	}

	/** Everyone present (empty when `observeParticipants` is off). */
	public get participants(): ChatParticipant[] {
		return this.#observer?.participants ?? [];
	}

	/** Say something in public chat. Resolves when the server acknowledges it. */
	public send(text: string): Promise<void> {
		return this.sendLine(text, 0);
	}

	/** Whisper to one participant. */
	public whisper(userId: string | number, text: string): Promise<void> {
		return this.sendLine(text, userId);
	}

	/**
	 * Boot a participant, the way the web client does: announce it in chat, then delete
	 * their participant record. Needs owner or moderator rights in this room. The
	 * deletion is what actually removes them, since well-behaved clients leave on the
	 * announcement but nothing forces a client to.
	 */
	public async boot(userId: string | number): Promise<void> {
		const target = String(userId);
		await this.sendLine(`*imvu:txnBoot ${target}`, 0);
		await this.sendLine(`*boot ${this.userId} ${target}`, 0);

		const participants = this.chat.relations.participants ?? `${this.chat.url}/participants`;
		const response = await this.client.rest.fetch(`${participants}/user-${target}`, { method: 'DELETE' });
		await response.text();
		if (!response.ok && response.status !== 404) {
			throw new Error(`Booting ${target} failed with HTTP ${response.status}`);
		}
	}

	/** Leave the room. Safe to call more than once. */
	public leave(): Promise<void> {
		return this.close('left');
	}

	private async start(options: JoinOptions): Promise<void> {
		this.#subscription = await this.client.realtime.listen(this.chat.imqQueue, this.chat.imqMessagesMount, (message) =>
			this.onChat(message)
		);

		if (options.observeParticipants ?? true) {
			this.#observer = await this.chat.observe(options);
			this.#observer.on('join', (participant) => this.emit('join', participant));
			this.#observer.on('leave', (event) => {
				this.emit('leave', event);
				if (event.userId === this.userId && !this.closed) void this.close('removed');
			});
			this.#observer.on('update', (participant, changes) => this.emit('update', participant, changes));
			this.#observer.on('error', (error) => this.emitError(error));
		}

		const interval = options.keepAliveInterval ?? 45_000;
		this.#keepAlive = setInterval(() => void this.keepAlive(), interval);
	}

	private async keepAlive(): Promise<void> {
		if (this.closed) return;
		try {
			await this.client.request(this.participantUrl, { method: 'POST', data: {} });
		} catch (error) {
			// The server no longer knows us (expired or booted while we were away).
			if (error instanceof IMVUAPIError) await this.close('removed');
			else this.emitError(error as Error);
		}
	}

	private onChat({ userId: envelopeUser, message }: RealtimeMessage): void {
		if (this.closed) return;
		const payload = parseChatPayload(message);
		if (!payload) return;

		const sender = envelopeUser || String(payload.userId ?? '');
		const own = sender === this.userId;
		if (own && this.#options.ignoreOwnMessages) return;

		const line = parseChatLine(payload.message);
		switch (line.kind) {
			case 'text':
				this.emit('message', {
					userId: sender,
					text: line.text,
					action: line.action,
					to: payload.to,
					whisper: payload.to !== 0,
					toMe: payload.to !== 0 && String(payload.to) === this.userId,
					receivedAt: new Date(),
					payload,
				});
				break;
			case 'outfit':
				this.emit('outfit', { userId: sender, productIds: line.productIds });
				break;
			case 'seat':
				this.emit('seat', { userId: line.userId || sender, seatNumber: line.seatNumber, furniId: line.furniId });
				break;
			case 'command':
				this.emit('command', { userId: sender, command: line.command, args: line.args });
				break;
			case 'boot':
				this.onBoot(line.booterId ?? sender, line.targetId);
				break;
		}
	}

	private onBoot(booterId: string, targetId: string): void {
		this.emit('boot', { booterId, targetId });
		if (targetId !== this.userId || this.#booted) return;

		this.#booted = true;
		this.emit('booted', { by: booterId });
		if (this.#options.leaveWhenBooted) void this.close('booted');
	}

	private async sendLine(text: string, to: string | number): Promise<void> {
		if (this.closed) throw new Error('This chat session is closed');
		const payload = encodeChatPayload(this.chat.realtimeId, text, this.userId, to);
		await this.client.realtime.send(this.chat.imqQueue, this.chat.imqMessagesMount, payload);
	}

	private close(reason: ChatSessionCloseReason): Promise<void> {
		this.#closing ??= (async () => {
			clearInterval(this.#keepAlive);
			this.#subscription?.close();
			this.#observer?.close();

			if (reason !== 'removed') {
				try {
					const response = await this.client.rest.fetch(this.participantUrl, { method: 'DELETE' });
					await response.text();
				} catch (error) {
					this.emitError(error as Error);
				}
			}

			this.emit('close', { reason });
			this.removeAllListeners();
		})();
		return this.#closing;
	}

	private emitError(error: Error): void {
		if (this.listenerCount('error') > 0) this.emit('error', error);
	}
}
