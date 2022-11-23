import { IMQStream } from './IMQStream';

export abstract class IMQConnectionStrategy {
	public url = '';

	protected constructor(public config: Record<string, unknown>) {
		this.url = config.httpUrl as string;
	}

	public abstract connect(): IMQStream;

	public encode(event: string, b: any): any {
		throw new Error('IMQConnectionStrategy encode() function must be overridden');
	}

	public decode(event: any): any {
		throw new Error('IMQConnectionStrategy decode() function must be overridden');
	}
}
