export interface RateLimit {
	/** Messages allowed per window. */
	messages: number;
	/** Window length in milliseconds. */
	perMs: number;
}

/**
 * A sliding-window send queue. Tasks run in order, never more than `messages` per
 * `perMs`; once `maxQueue` tasks are waiting, new ones are rejected rather than
 * piling up behind a flood.
 */
export class RateLimiter {
	private readonly sentAt: number[] = [];
	private readonly waiting: Array<() => void> = [];
	private draining = false;
	private timer?: ReturnType<typeof setTimeout>;
	private stopped = false;

	public constructor(
		private readonly limit: RateLimit,
		private readonly maxQueue = 20,
		private readonly now: () => number = Date.now
	) {
		if (limit.messages < 1 || limit.perMs < 0) throw new RangeError('Invalid rate limit');
	}

	public get pending(): number {
		return this.waiting.length;
	}

	public schedule<T>(task: () => Promise<T>): Promise<T> {
		if (this.stopped) return Promise.reject(new Error('The rate limiter has stopped'));
		if (this.waiting.length >= this.maxQueue) {
			return Promise.reject(new Error(`Outgoing queue is full (${this.maxQueue} waiting)`));
		}

		return new Promise<T>((resolve, reject) => {
			this.waiting.push(() => {
				task().then(resolve, reject);
			});
			this.drain();
		});
	}

	/** Reject nothing already sent; drop everything still waiting. */
	public stop(): void {
		this.stopped = true;
		this.waiting.length = 0;
		clearTimeout(this.timer);
	}

	private drain(): void {
		if (this.draining || this.stopped) return;
		this.draining = true;

		while (this.waiting.length > 0) {
			const now = this.now();
			while (this.sentAt.length > 0 && now - this.sentAt[0] >= this.limit.perMs) this.sentAt.shift();

			if (this.sentAt.length >= this.limit.messages) {
				const wait = this.limit.perMs - (now - this.sentAt[0]);
				this.timer = setTimeout(() => {
					this.draining = false;
					this.drain();
				}, wait);
				return;
			}

			this.sentAt.push(now);
			this.waiting.shift()!();
		}

		this.draining = false;
	}
}
