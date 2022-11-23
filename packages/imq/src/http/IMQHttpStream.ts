import { IMQStream } from '../IMQStream';

export class IMQHttpStream extends IMQStream {
	public XMLHttpRequest: typeof XMLHttpRequest;

	private connectionId: number;
	private retryDelay: number;
	private maxRetries: number;

	private debug: boolean;

	private sendSeq = 1;
	private ackSeq = 0;
	private requestSeq = 0;

	private requestQueue: any[] = [];
	private receiveBuffer: any[] = [];
	private requestCount = 0;

	public constructor(config: Record<string, any>) {
		super(config);

		this.XMLHttpRequest = config.XMLHttpRequest ?? XMLHttpRequest;
		this.connectionId = config.connectionId ?? 0;
		this.retryDelay = config.networkErrorRetryDelay ?? 2e3;
		this.maxRetries = config.maxNetworkErrorRetries ?? 5;

		this.debug = config.debug ?? false;
	}

	public send(data: any) {
		throw new Error('IMQHttpStream send method must be overridden');
	}

	public close() {
		throw new Error('IMQHttpStream close method must be overridden');
	}
}
