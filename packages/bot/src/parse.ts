export interface ParsedCommand {
	/** Lower-cased command name, without the prefix. */
	name: string;
	/** Whitespace-separated arguments; "double" or 'single' quotes group words. */
	args: string[];
	/** Everything after the command name, as typed. */
	argText: string;
}

/** Parse `!name arg "two words"`, or return null when `text` is not a command. */
export function parseCommand(text: string, prefix: string): ParsedCommand | null {
	const trimmed = text.trim();
	if (!prefix || !trimmed.startsWith(prefix)) return null;

	const body = trimmed.slice(prefix.length);
	const match = /^(\S+)\s*([\s\S]*)$/.exec(body);
	if (!match) return null;

	return { name: match[1].toLowerCase(), args: splitArgs(match[2]), argText: match[2] };
}

function splitArgs(text: string): string[] {
	const args: string[] = [];
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const match of text.matchAll(pattern)) args.push(match[1] ?? match[2] ?? match[3]);
	return args;
}
