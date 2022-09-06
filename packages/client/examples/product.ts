import { Client } from '../src';

async function main() {
	const client = new Client();

	await client.login(process.env.IMVU_USERNAME!, process.env.IMVU_PASSWORD!);

	console.log(`Logged in as ${client.account.username}`);

	const [user] = await client.users.search({ username: 'Dvah' });

	if (!user) {
		throw new Error('User not found!');
	}

	console.log(`Found user ${user.username} with id ${user.id}`);
}

main();
