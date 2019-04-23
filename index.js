const imvu = require('./build');

async function main() {
  const client = new imvu.Client();

  const user = await client.user.get({ id: 133209099 });

  console.log(user);
}

main();
