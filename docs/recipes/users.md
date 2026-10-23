# Users and profiles

All of these assume a logged-in `client`. See [Getting started](/guide/getting-started).

## Find a user

```ts
// By username: an array, empty when nobody has that name
const [user] = await client.users.search({ username: 'Alice' });
if (!user) throw new Error('No such user');

// By id: faster, if you have one
const same = await client.users.fetch(user.id);
```

A `User` has the basics as fields:

```ts
user.username;
user.displayName;
user.avatarImage; // URL of their avatar picture
user.country;
user.isVip;
user.isCreator;
user.created; // ISO 8601 date string
```

## Follow relationships

Related data is loaded when you ask for it. A user's **profile** carries their
follower counts and lists:

```ts
const profile = await user.profile();
if (profile) {
  console.log(`${profile.followerCount} followers (approximate)`);

  for await (const follower of profile.followers()) {
    console.log(follower.username, follower.online ? '(online)' : '');
  }
}
```

Other relations work the same way, and each returns `null` when the user doesn't have
one:

```ts
const spouse = await user.spouse();
const room = await user.current_room();
const creator = await user.creator(); // creator details, if they sell products
```

## Follow and friend

```ts
await client.account.followers.follow(user); // or profile.follow()
await client.account.followers.unfollow(user);

await client.account.friends.add(user); // sends a friend request
await client.account.friends.remove(user);
```

Each returns `true` on success and `false` if IMVU refused. They accept a `User`, an
id, or a **username**, which is looked up for you:

```ts
await client.account.friends.add('Alice');
```

## A creator's shop

```ts
const creator = await user.creator();
if (creator) {
  console.log(`tier ${creator.tier}${creator.isTopSeller ? ', top seller' : ''}`);

  const firstPage = await creator.products().page({ limit: 10 });
  for (const product of firstPage) console.log(product.name, product.price);
}
```

For your **own** creator account, `creator.sales()` lists sale events.

## Products

```ts
const product = await client.products.fetch(51522827);
if (product) {
  console.log(product.name, 'by', product.creatorName);
  console.log(`${product.price} credits`, product.isPurchasable ? '' : '(not for sale)');

  const seller = await product.creator(); // the creator's User
  const parent = await product.parent(); // the product it derives from, if any

  // Every ancestor, nearest first, without fetching parents one by one
  for await (const ancestor of product.ancestors()) console.log(ancestor.id, ancestor.name);
}
```

To get at a product's actual files, see [Download products](/recipes/download-products).
