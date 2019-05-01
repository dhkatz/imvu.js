## User

```typescript
import imvu from 'imvu.js'

async function main() {
  const client = new imvu.Client();

  const [user] = await client.user.fetch({ id: 157015261 });

  console.log(user.username);
};

main();

```
