/**
 * IMVU room chat wire format. Each line is a JSON string on the chat's IMQ message
 * mount: `{chatId, message, to, userId}`. `chatId` is the `imq_queue` suffix, `to` is
 * `0` for public chat or the recipient's cid for a whisper. The payload's `userId` is
 * whatever the sending client wrote (string or number, unvalidated). The sender's real
 * identity is the IMQ envelope's `user_id`. Lines starting with `*` are legacy
 * client-to-client commands (outfits, seats, boots, …). See ROADMAP.md for captures.
 */

export interface ChatPayload {
	chatId: string;
	message: string;
	to: number;
	/** As written by the sender, so untrusted. Use the IMQ envelope's user id instead. */
	userId?: string | number;
	[field: string]: unknown;
}

export type ChatLine =
	/** Ordinary chat. `action` is true for `/me …` narration (the prefix is stripped from `text`). */
	| { kind: 'text'; text: string; action: boolean }
	/** `*putOnOutfit <pid> …`: the sender's outfit, avatar body first. */
	| { kind: 'outfit'; productIds: string[] }
	/** `*msg SeatAssignment <n> <cid> <seat> <furniId>`. */
	| { kind: 'seat'; userId: string; seatNumber: number; furniId: string }
	/** `*boot <booterCid> <targetCid>` or `*imvu:txnBoot <targetCid>`. */
	| { kind: 'boot'; targetId: string; booterId?: string }
	/** Any other `*` command, e.g. `*use …`, `*imvu:isPureUser`, `*imvu:trigger …`. */
	| { kind: 'command'; command: string; args: string[] };

/** Decode a chat mount message into a payload, or `null` if it is not chat. */
export function parseChatPayload(raw: unknown): ChatPayload | null {
	let value = raw;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (typeof value !== 'object' || value === null) return null;

	const payload = value as Record<string, unknown>;
	if (typeof payload.message !== 'string') return null;

	return {
		...payload,
		chatId: typeof payload.chatId === 'string' || typeof payload.chatId === 'number' ? String(payload.chatId) : '',
		message: payload.message,
		to: Number(payload.to ?? 0) || 0,
	} as ChatPayload;
}

/** Classify a chat line's text. */
export function parseChatLine(text: string): ChatLine {
	if (text.startsWith('*')) {
		const [command, ...args] = text.slice(1).split(/\s+/).filter(Boolean);

		switch (command) {
			case 'putOnOutfit':
				return { kind: 'outfit', productIds: args.filter((id) => /^\d+$/.test(id)) };
			case 'msg':
				if (args[0] === 'SeatAssignment' && args.length >= 5) {
					return { kind: 'seat', userId: args[2], seatNumber: Number(args[3]), furniId: args[4] };
				}
				break;
			case 'boot':
				if (args.length >= 2) return { kind: 'boot', booterId: args[0], targetId: args[1] };
				break;
			case 'imvu:txnBoot':
				if (args.length >= 1) return { kind: 'boot', targetId: args[0] };
				break;
		}

		return { kind: 'command', command: command ?? '', args };
	}

	if (/^\/me(\s|$)/i.test(text)) return { kind: 'text', text: text.slice(3).trimStart(), action: true };
	return { kind: 'text', text, action: false };
}

/** Build the payload for a chat line. */
export function encodeChatPayload(
	chatId: string,
	message: string,
	userId: string,
	to: string | number = 0
): ChatPayload {
	// The web client sends a numeric userId; keep non-numeric ids as strings rather than NaN.
	return { chatId, message, to: Number(to) || 0, userId: /^\d+$/.test(userId) ? Number(userId) : userId };
}
