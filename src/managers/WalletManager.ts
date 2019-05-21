import { BaseManager } from './BaseManager';

export class WalletManager extends BaseManager {
  public async credits() {
    const { data } = await this.client.http.get(`/wallet/wallet-${this.client.user.id}`);

    return data['denormalized'][`https://api.imvu.com/wallet/wallet-${this.client.user.id}`]['data']['credits'];
  }

  public async promoCredits() {
    const { data } = await this.client.http.get(`/wallet/wallet-${this.client.user.id}`);

    return data['denormalized'][`https://api.imvu.com/wallet/wallet-${this.client.user.id}`]['data']['promo_credits'];
  }
}
