import { BaseManager } from './BaseManager';
import { DateMapped } from '../types';

export type RouletteResponse = DateMapped<{
  status: 'available' | 'redeemed';
  remaining_redeems: number;
  next_available_datetime: string;
  current_datetime: string;
  slot_count: number;
  roulette_image: string;
  upgrade_available: boolean;
  background_image: string;
  reward?: {
    slot_index: number;
    type: string;
    text: string;
    image: string;
    redeemed_datetime: string;
  };
}>;

export class RouletteManager extends BaseManager {
  public async available(): Promise<boolean> {
    return this.authenticated() && this.status().then((status) => status.status !== 'redeemed');
  }

  public async status(): Promise<RouletteResponse> {
    this.authenticated();

    const { data } = await this.client.resource<RouletteResponse>(
      `/roulette/roulette-${this.client.account.id}`
    );

    return data;
  }

  /**
   * Spin the roulette wheel.
   * @returns
   */
  public async spin(): Promise<RouletteResponse> {
    this.authenticated();

    const status = await this.status();

    if (status.status === 'available') {
      await this.client.http.post(`/roulette/roulette-${this.client.account.id}`, {
        status: 'redeemed',
      });

      return this.status();
    }

    return status;
  }
}
