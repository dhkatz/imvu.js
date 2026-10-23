# Watch a room

Follow who comes and goes in a room, and what they wear, without joining it. Nobody
in the room can see you. Needs a logged-in account.

<<< ../../examples/room-watch.ts

- `observer.participants` is a live map of everyone present, by user id.
- `participant.user` is the full `User`, embedded in the participant list, so no
  extra request is made per person.
- `participant.productIds` is the outfit, avatar body first. Pass the ids to
  [`Product.load`](/recipes/download-products) to fetch the items themselves.
- To watch many rooms, open one observer per room. They share one IMQ connection.
  Pass `{ trackChanges: false }` if you only need joins and leaves, which saves a
  request per participant keepalive.

Run it with `node --env-file=.env examples/room-watch.ts [roomId]`. See
[Rooms and chat](/guide/rooms) for how observation works.
