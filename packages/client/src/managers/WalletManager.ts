import { BaseManager } from './BaseManager';
import { Client } from '../client';

export class WalletManager extends BaseManager {
	constructor(client: Client) {
		super(client);
	}

	public async status(): Promise<WalletResponse> {
		return this.client
			.resource<WalletResponse>(`/wallet/wallet-${this.client.account.id}`)
			.then(({ data }) => data);
	}
}

export interface WalletResponse {
	credits: number;
	promo_credits: number;
	dev_tokens: number;
	vcoin_total: number;
	vcoin_eligible: number;
	vcoin_withdrawn: number;
	verification_required: boolean;
	verification_status: number;
	uphold_url: string;
	vcoin_min_withdrawal_limit: number;
	vcoin_max_gift_limit: number;
	vcoin_min_gift_limit: number;
	credit_min_gift_limit: number;
	vcoin_escrow_period: number;
	vcoin_link_to_uphold_waiting_period: number;
	vcoin_withdrawal_processing_period: string;
	vcoin_withdrawal_limit_amount: number;
	vcoin_withdrawal_limit_timeframe: number;
	vcoin_conversion_to_credit_rate: number;
	vcoin_min_convert_limit: number;
	vcoin_monthly_conversion_limit: number;
	credit_2fa_required: boolean;
	vcoin_2fa_required: boolean;
	vcoin_minimum_pay: number;
	vcoin_maximum_pay: number;
	location_status: string;
}
