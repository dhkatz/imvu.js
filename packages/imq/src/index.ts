import { IMQManager } from './IMQManager';
import { Client } from '@imvu/client';

async function main() {
	const client = new Client();

	await client.login(process.env.IMVU_USERNAME!, process.env.IMVU_PASSWORD!);

	const manager = new IMQManager({
		url: '', // Get from /login/me using client (relations.imq)
		metadata: {
			app: 'imvu_next',
			platform_type: 'big',
		},
		userId: '', // User.legacy_cid
	});

	await manager.connect();
}

main().catch(console.error);
