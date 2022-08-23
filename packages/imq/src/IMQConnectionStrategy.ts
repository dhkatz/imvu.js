import { IMQStream } from './IMQStream.new';

export abstract class IMQConnectionStrategy {
  public url = '';

  protected constructor(public config: Record<string, unknown>) {
    this.url = config.httpUrl as string;
  }

  public abstract connect(): IMQStream;

  public encode(a: any, b: any): any {
    return {};
  }

  public decode(a: any): any {}
}
