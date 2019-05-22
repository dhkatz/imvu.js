import { BaseManager } from './BaseManager';

export class RoomManager extends BaseManager {
  public async recent(): Promise<any> {
    const { data } = await this.client.http.get(`/user/user-${this.client.user.id}/recent_rooms`);

    const urls = data['denormalized'][`https://api.imvu.com/user/user-${this.client.user.id}/recent_rooms`]['data']['items'] as string[];

    return urls.map((url: string) => ({}));
  }
}
