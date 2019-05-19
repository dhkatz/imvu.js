import { Client } from '@/client';

export abstract class BaseExtension {
  public constructor(public client: Client) {
    
  }

  public abstract async parse(...args: any[]): Promise<any>;
}
