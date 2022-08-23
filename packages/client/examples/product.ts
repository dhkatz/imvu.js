import { Client } from '../src';

async function main() {
  const client = new Client();

  await client.login(process.env.IMVU_USERNAME!, process.env.IMVU_PASSWORD!);

  console.log(`Logged in as ${client.account.username}`);

  const rouletteResponse = await client.account.roulette.status();

  console.log(rouletteResponse);
}

main();
