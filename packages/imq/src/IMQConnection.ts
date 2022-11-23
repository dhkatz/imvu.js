import { IMQConnectionStrategy } from './IMQConnectionStrategy';
import { IMQStream } from './IMQStream';
import { EventEmitter } from 'events';
import { MessageEvent } from 'ws';
import { IMQWebSocketConnectionStrategy } from './websocket/IMQWebSocketConnectionStrategy';
import { ClientEvent, EventNameToType } from './Events';

export enum Status {
	CLOSED,
	CONNECTING,
	AUTHENTICATING,
	AUTHENTICATED,
	WAITING,
}

type Timeout = ReturnType<typeof setTimeout>;

export class IMQConnection extends EventEmitter {
	private strategy: IMQConnectionStrategy;
	private stream?: IMQStream;
	private state = Status.CLOSED;

	private connectRetryTimerHandle?: Timeout;
	private connectRetryIntervalIndex = 0;
	private currentStrategyIndex = 0;
	private lastMessageTime = 0;
	private receivedMessageTimerHandle?: Timeout;
	private pingTimerHandle?: Timeout;

	public constructor(private config: Record<string, any> = {}) {
		super();

		this.strategy = new IMQWebSocketConnectionStrategy(config);

		this.config.onPreReconnectCallback =
			this.config.onPreReconnectCallback ||
			((d: any) => {
				d(null, null);
			});

		this.config.pingInterval = this.config.pingInterval || 15e3;
		this.config.reconnect = this.config.reconnect ?? [5e3, 15e3, 45e3, 9e4, 18e4];
		this.config.serverTimeoutInterval = this.config.serverTimeoutInterval || 60e3;
	}

	get status() {
		return this.state;
	}

	private set status(state: Status) {
		this.state = state;

		if (state === Status.WAITING) {
			this.emit('state', state); // TODO: Add time
		} else {
			this.emit('state', state);
		}
	}

	public connect() {
		if (this.status !== Status.WAITING && this.status !== Status.CLOSED) {
			return; // Already connected/connecting
		}

		this.clearConnectRetryTimer();
		this.status = Status.CONNECTING;

		if (this.currentStrategyIndex >= this.config.strategies.length) {
			this.currentStrategyIndex = 0;
		}

		this.strategy = this.config.strategies[this.currentStrategyIndex++];

		console.log(`Connecting to IMQ via '${this.strategy.url}' as user '${this.config.user}'`);

		this.stream = this.strategy.connect();
		this.stream.on('open', () => this.onOpen());
		this.stream.on('close', () => this.onClose());
		this.stream.on('error', (error: Error) => this.onError(error));
		this.stream.on('message', (message: MessageEvent) => this.onMessage(message));

		this.scheduleServerTimeout();
	}

	public send(a: any, b: any, id: number) {
		this._send(a, b);
	}

	public close() {
		console.log('Disconnecting from IMQ');

		this.reset();
		this.disconnect();

		this.status = Status.CLOSED;
	}

	private onOpen() {
		this.status = Status.AUTHENTICATING;
		this.stream?.send(
			this.strategy.encode('msg_c2g_connect', {
				user_id: this.config.userId,
				cookie: this.config.sessionId,
				metadata: this.config.metadata,
			})
		);
	}

	private onMessage(message: MessageEvent) {
		this.scheduleServerTimeout();
		this.lastMessageTime = Date.now();

		const event = this.strategy.decode(message.data);

		if (this.status === Status.AUTHENTICATING) {
			if (event.type === 'msg_g2c_result') {
				if (!event.data.error) {
					console.log('IMQ authenticated');

					this._send('msg_c2g_open_floodgates', {});
					this.onAuthenticated();
				} else {
					console.log(`Failed to authenticate with IMQ: ${event.data.error}`);
				}
			} else {
				console.log(`unexpected message type during IMQ authentication: ${event.type}`);

				this.onDisconnected();
			}
		} else if (event.type !== 'msg_g2c_pong') {
			this.emit('message', event);
		}
	}

	private onError(err: any) {
		console.log('IMQ WebSocket error!');
	}

	private onClose() {
		this.onDisconnected();
	}

	private onDisconnected() {
		this.disconnect();
		console.log('Connection to IMQ closed');
		this.reconnect();
	}

	private onAuthenticated() {
		this.status = Status.AUTHENTICATED;
		this.reset();
	}

	private reset() {
		this.currentStrategyIndex = 0;
		this.connectRetryIntervalIndex = 0;
	}

	private disconnect() {
		this.clearConnectRetryTimer();
		this.clearServerTimer();
		this.clearPingTimer();

		if (this.stream) {
			this.stream.removeAllListeners();
			this.stream.close();
			this.stream = undefined;
		}
	}

	private clearConnectRetryTimer() {
		if (this.connectRetryTimerHandle) {
			clearTimeout(this.connectRetryTimerHandle);
			this.connectRetryTimerHandle = undefined;
		}
	}

	private reconnect() {
		if (this.currentStrategyIndex < this.config.strategies.length) {
			this.status = Status.WAITING;
			this.connect();
			return;
		}

		if (this.connectRetryIntervalIndex === this.config.reconnect.length) {
			this.connectRetryIntervalIndex = 0;
		}

		const timeout = this.config.reconnect[this.connectRetryIntervalIndex++];

		console.log(`Reconnecting to IMQ in ${timeout / 1000} seconds`);

		this.status = Status.WAITING;

		this.connectRetryTimerHandle = setTimeout(() => {
			this.config.onPreReconnectCallback((err: any, config: any) => {
				if (err) {
					console.log(`Error in IMQ pre-reconnect callback: ${err}`);
					this.reconnect();
				} else {
					this.config = { ...this.config, ...config };
					this.currentStrategyIndex = 0;
					this.connect();
				}
			}, Date.now() - this.lastMessageTime);
		}, timeout);
	}

	private _send<T extends ClientEvent['record']>(
		record: T,
		event: Omit<EventNameToType<ClientEvent, 'record', T>, 'record'>
	) {
		this.schedulePing();

		this.stream?.send(this.strategy.encode(record, event));
	}

	private scheduleServerTimeout() {
		this.clearServerTimer();

		this.receivedMessageTimerHandle = setTimeout(() => {
			this.onServerTimeout();
		}, this.config.serverTimeoutInterval);
	}

	private clearServerTimer() {
		if (this.receivedMessageTimerHandle) {
			clearTimeout(this.receivedMessageTimerHandle);
			this.receivedMessageTimerHandle = undefined;
		}
	}

	private onServerTimeout() {
		console.log(
			`No message from IMQ server for ${
				this.config.serverTimeoutInterval / 1000
			} seconds, disconnecting`
		);
		this.onDisconnected();
	}

	private schedulePing() {
		this.clearPingTimer();
		this.pingTimerHandle = setTimeout(() => {
			this.sendPing();
		}, this.config.pingInterval);
	}

	private clearPingTimer() {
		if (this.pingTimerHandle) {
			clearTimeout(this.pingTimerHandle);
			this.pingTimerHandle = undefined;
		}
	}

	private sendPing() {
		this._send('msg_c2g_ping', {});
	}
}
