import { BaseManager } from './BaseManager';

export class WalletManager extends BaseManager {
  public async credits(): Promise<number> {
    const { data } = await this.client.http.get(`/wallet/wallet-${this.client.user.id}`);

    return data['denormalized'][data.id]['data']['credits'];
  }

  public async promoCredits(): Promise<number> {
    const { data } = await this.client.http.get(`/wallet/wallet-${this.client.user.id}`);

    return data['denormalized'][data.id]['data']['promo_credits'];
  }
}
