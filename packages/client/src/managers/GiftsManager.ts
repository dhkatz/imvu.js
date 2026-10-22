import { BaseManager } from './BaseManager.js';
import { Product, User } from '../resources/index.js';
import { IMVUAPIError, type ResourceId } from '@imvu/rest';
import type { Result } from '../result.js';

export interface GiftReceipt {
	transactionId: string;
	recipient: User;
	product: Product;
}

export type GiftRejectionReason =
	| 'insufficient_credits'
	| 'already_owned'
	| 'not_giftable'
	| 'recipient_restricted'
	| 'unknown';

export type GiftFailure =
	| {
			kind: 'rejected';
			reason: GiftRejectionReason;
			message: string;
			apiCode: string;
			transactionId: string;
	  }
	| {
			kind: 'indeterminate';
			message: string;
			transactionId: string;
			cause: unknown;
	  };

export type GiftResult = Result<GiftReceipt, GiftFailure>;

export interface SendGiftOptions {
	recipient: User | ResourceId | number;
	product: Product | ResourceId | number;
	message?: string;
	transactionId?: string;
}

export class GiftsManager extends BaseManager {
	public async send({ recipient, product, message = '', transactionId }: SendGiftOptions): Promise<GiftResult> {
		this.authenticated();

		const recipientId = await this.client.utils.id(recipient, true);
		const productId = await this.client.utils.id(product);
		const recipientResource = recipient instanceof User ? recipient : await this.client.users.fetch(recipientId);
		const productResource = product instanceof Product ? product : await this.client.products.fetch(productId);

		if (!recipientResource) throw new Error(`Unable to resolve gift recipient ${recipientId}`);
		if (!productResource) throw new Error(`Unable to resolve gift product ${productId}`);

		const txnId = transactionId ?? this.transactionId(recipientId);

		try {
			await this.client.request(`/user/user-${this.client.account.id}/gifts`, {
				method: 'POST',
				data: {
					id: `https://api.imvu.com/user/user-${recipientId}`,
					product_id: `https://api.imvu.com/product/product-${productId}`,
					is_thank_you: false,
					txn_id: txnId,
					type: 1,
					message,
				},
			});
		} catch (error) {
			if (error instanceof IMVUAPIError) {
				return {
					ok: false,
					error: {
						kind: 'rejected',
						reason: giftReason(error.apiCode),
						message: error.message,
						apiCode: error.apiCode,
						transactionId: txnId,
					},
				};
			}

			return {
				ok: false,
				error: {
					kind: 'indeterminate',
					message: error instanceof Error ? error.message : String(error),
					transactionId: txnId,
					cause: error,
				},
			};
		}

		return { ok: true, value: { transactionId: txnId, recipient: recipientResource, product: productResource } };
	}

	/** Compatibility convenience; prefer {@link send} for named arguments. */
	public gift(
		user: User | ResourceId | number,
		product: Product | ResourceId | number,
		message = ''
	): Promise<GiftResult> {
		return this.send({ recipient: user, product, message });
	}

	private transactionId(recipientId: ResourceId): string {
		return `gift-${this.client.account.id}-${recipientId}-${Date.now()}`;
	}
}

function giftReason(apiCode: string): GiftRejectionReason {
	const knownReasons: Partial<Record<string, GiftRejectionReason>> = {
		insufficient_credits: 'insufficient_credits',
		already_owned: 'already_owned',
		not_giftable: 'not_giftable',
		recipient_restricted: 'recipient_restricted',
	};

	return knownReasons[apiCode.toLowerCase()] ?? 'unknown';
}
