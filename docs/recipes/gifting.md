# Gifting

`client.account.gifts.send()` buys a product for another user with your credits.

::: warning This spends real credits
Try new gifting code against a cheap product first, and handle the
`indeterminate` case below. Retrying blindly after it can buy the gift twice.
:::

## Send a gift

```ts
const [recipient] = await client.users.search({ username: 'Alice' });
if (!recipient) throw new Error('No such user');

const result = await client.account.gifts.send({
  recipient, // a User, user id, or username
  product: 51522827, // a Product or product id
  message: 'Happy birthday!',
});

if (result.ok) {
  const { transactionId, product } = result.value;
  console.log(`Sent ${product.name} (${transactionId})`);
}
```

## Handle every outcome

`send()` doesn't throw for expected failures. It returns a `Result` whose `error`
says which of two things happened:

```ts
if (!result.ok) {
  const { error } = result;

  switch (error.kind) {
    case 'rejected':
      // IMVU refused the gift, and nothing was charged.
      switch (error.reason) {
        case 'insufficient_credits':
          return notify('Not enough credits');
        case 'already_owned':
          return notify(`${recipient.username} already owns that`);
        case 'not_giftable':
        case 'recipient_restricted':
          return notify(error.message);
        default:
          return notify(`IMVU said: ${error.message} (${error.apiCode})`);
      }

    case 'indeterminate':
      // The request failed in transit. The gift may or may not have gone through.
      // Record error.transactionId and check before trying again.
      log.warn('gift outcome unknown', error.transactionId, error.cause);
      return;
  }
}
```

Every attempt has a transaction id. One is generated if you don't pass
`transactionId`, and it appears in both the success value and the error, so you can
log and reconcile attempts.

## Gift from someone's wishlist

Wishlists can be long, so read them a page at a time and stop at the first match:

```ts
async function giftFromWishlist(username: string, budget: number) {
  const [person] = await client.users.search({ username });
  if (!person) throw new Error(`No user ${username}`);

  for await (const product of person.wishlist()) {
    if (!product.isPurchasable || product.price < 0 || product.price > budget) continue;

    const result = await client.account.gifts.send({ recipient: person, product });
    if (result.ok) return product;
    if (result.error.kind === 'indeterminate') throw result.error.cause;
    // Rejected (for example, already owned): try the next one.
  }

  return null;
}
```

Check your balance first with `client.account.wallet.status()` to avoid a run of
`insufficient_credits` rejections.
