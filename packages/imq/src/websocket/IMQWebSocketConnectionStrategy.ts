import { Constructor } from 'type-fest';
import WebSocket from 'ws';

import { IMQConnectionStrategy } from '../IMQConnectionStrategy';
import { IMQWebSocketStream } from './IMQWebSocketStream';
import { IMQTranscoder } from '../IMQTranscoder';

export class IMQWebSocketConnectionStrategy extends IMQConnectionStrategy {
	private readonly socketFactory: Constructor<WebSocket>;
	private readonly transcoder: IMQTranscoder = new IMQTranscoder();

	public constructor(config: Record<string, any>) {
		super(config);

		this.url = config.url ?? 'wss://imq.imvu.com:444/streaming/imvu_pre';

		this.socketFactory = config.socketFactory ?? globalThis.WebSocket;
	}

	connect() {
		return new IMQWebSocketStream(new this.socketFactory(this.config.url));
	}

	public encode(event: string, b: any): any {
		return this.transcoder.encode(event, b);
	}

	public decode(event: any): any {
		return this.transcoder.decode(event);
	}
}
