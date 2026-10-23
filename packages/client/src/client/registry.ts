import type { ResourceConstructor } from '../resources/Resource.js';
import { Chat, ChatParticipant, Conversation, ConversationMessage, Product, Room, User } from '../resources/index.js';

/**
 * Canonical URL shapes of the resources the client builds from embedded documents
 * it did not ask for (e.g. the users embedded in a participant list). Anything not
 * listed is only refreshed if an instance already exists.
 */
const RESOURCE_TYPES: ReadonlyArray<[RegExp, () => ResourceConstructor]> = [
	[/\/user\/user-[^/?#]+$/, () => User],
	[/\/product\/product-[^/?#]+$/, () => Product],
	[/\/room\/room-[^/?#]+$/, () => Room],
	[/\/chat\/chat-[^/?#]+$/, () => Chat],
	[/\/chat\/chat-[^/?#]+\/participants\/user-[^/?#]+$/, () => ChatParticipant],
	[/\/conversation\/conversation-[^/?#]+$/, () => Conversation],
	[/\/message\/message-[^/?#]+$/, () => ConversationMessage],
];

export function resourceTypeFor(url: string): ResourceConstructor | undefined {
	return RESOURCE_TYPES.find(([pattern]) => pattern.test(url))?.[1]();
}
