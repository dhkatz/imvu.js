import { BaseExtension } from './BaseExtenstion';

export interface RouletteData {
  available: boolean;
  next: Date;
  slots: number;
  upgrade: boolean;
  reward?: {
    slot: number;
    type: string;
    text: string;
    time: Date;
  };
}

export class Roulette extends BaseExtension {
  public async status(): Promise<RouletteData> {
    const { data } = await this.client.http.get(`/roulette/roulette-${this.client.user.id}`);

    const info = data['denormalized'][`https://api.imvu.com/roulette/roulette-${this.client.user.id}`]['data'];

    return {
      available: info.status !== 'redeemed',
      next: new Date(info.next_available_datetime),
      slots: info.slot_count,
      upgrade: info.upgrade_available,
      ...(!info.reward ? {} : {
        slot: info.reward.slot_index,
        type: info.reward.type,
        text: info.reward.text,
        time: new Date(info.reward.redeemed_datetime)
      })
    };
  }

  public async spin(): Promise<boolean> {
    try {
      await this.client.http.post(`/roulette/roulette-${this.client.user.id}`, {
        status: 'redeemed',
      });
    } catch {
      return false;
    }

    return true;
  }
}
