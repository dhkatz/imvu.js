import { Avatar } from './Avatar';
import { User } from './User';

export class ClientUser extends Avatar {
  public async * blocklist(): AsyncIterableIterator<User> {
    let offset = 0;
    while (true) {
      try {
        const { data } = await this.client.http.get(`/user/user-${this.id}/blocked`, { params: { start_index: offset, limit: 10 } })

        const users: User[] = await Promise.all((Object.values(data.denormalized).pop() as any).data.items
          .map((url: string) => parseInt(url.split('-').pop()))
          .map((id: number) => this.client.users.fetch(id)));
        
        if (!users.length) {
          return;
        }

        offset += 10;

        for (const user of users) {
          if (user === null) {
            continue;
          }

          yield user;
        }
      } catch (err) {
        return;
      }
    }
  }

  public async * friends(): AsyncIterableIterator<User> {

  }
}
