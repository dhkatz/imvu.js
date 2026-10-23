# Your account

`client.account` is everything about the logged-in user. It exists after
`client.login()`.

<<< ../../examples/account-overview.ts

## Who am I?

```ts
client.account.id;
client.account.username;
client.account.user; // your full User, with the same fields as any other user

const avatar = await client.account.avatar();
for await (const product of avatar.products()) {
  console.log('wearing', product.name);
}
```

## Wallet

```ts
const wallet = await client.account.wallet.status();
wallet.credits;
wallet.promo_credits;
wallet.vcoin_total;
```

The wallet is returned as IMVU sends it (snake_case), not as a resource.

## Friends

```ts
const friends = client.account.friends.list();
console.log(`${await friends.count()} friends`);

for await (const friend of friends) console.log(friend.username);

await client.account.friends.add('Alice'); // friend request
await client.account.friends.remove(someUser);
```

## Wishlist

```ts
const wishlist = client.account.wishlist.list();
const top = await wishlist.page({ limit: 10 });

await client.account.wishlist.add(51522827); // a product id or Product
await client.account.wishlist.remove(51522827);
```

Anyone's wishlist is available from their `User`: `user.wishlist()`.

## Inventory, blocklist and following

```ts
for await (const product of client.account.inventory()) {
  // everything you own
}

for await (const blocked of client.account.blocklist()) {
  console.log('blocked:', blocked.username);
}

for await (const profile of client.account.followers.following()) {
  console.log('following:', profile.username);
}
```

All three are ordinary [collections](/guide/concepts#collections): use `count()` for
a total, or `page()` for a slice.

## Daily spin

```ts
if (await client.account.roulette.available()) {
  const result = await client.account.roulette.spin();
  console.log('won:', result.reward?.text);
} else {
  const { next_available_datetime } = await client.account.roulette.status();
  console.log('next spin at', next_available_datetime);
}
```
