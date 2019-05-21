import { BaseManager } from './BaseManager';

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

export class RouletteManager extends BaseManager {
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

  /**
   * Spin the roulette wheel.
   * @returns 
   */
  public async spin(): Promise<RouletteData | null> {
    try {
      await this.client.http.post(`/roulette/roulette-${this.client.user.id}`, {
        status: 'redeemed',
      });
    } catch {
      null;
    }

    return this.status();
  }
}
