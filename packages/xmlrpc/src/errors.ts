/** Fault codes the IMVU gateway is known to return (from the classic client). */
export const FaultCode = {
	NoLongerInChat: 9,
	InvalidLoginOrPassword: 11,
	/** The session is no longer valid — typically another login replaced it. */
	InvalidAuthData: 30,
	RoomInUse: 44,
	SocialLoginNoMatchingCid: 100,
	SocialLoginGeneral: 101,
	WeakPassword: 102,
	AccountTemporarilyDisabled: 103,
	AccountPermanentlyDisabled: 104,
	BannedDevice: 105,
	TwoFactorRequired: 107,
	TwoFactorRequestVelocity: 108,
	TwoFactorWrongVelocity: 109,
	/** The server wants a proof-of-work solved before it accepts more calls. */
	ProofOfWorkRequired: 110,
	NeedsAccessPassPlus: 1015,
} as const;

/** A `<fault>` returned by the XML-RPC server. */
export class XmlRpcFault extends Error {
	public constructor(
		public readonly code: number,
		message: string
	) {
		super(message || `XML-RPC fault ${code}`);
		this.name = 'XmlRpcFault';
	}
}

/** A non-200 HTTP response from the gateway (no XML-RPC payload to decode). */
export class XmlRpcHttpError extends Error {
	public constructor(
		public readonly status: number,
		public readonly url: string
	) {
		super(`XML-RPC request to '${url}' failed with HTTP ${status}`);
		this.name = 'XmlRpcHttpError';
	}
}
