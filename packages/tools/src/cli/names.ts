import { readFileSync } from 'node:fs';
import { Command } from 'commander';

import { Client } from '@imvu/client';

import { countPattern, expandPattern, isPattern } from '../names/expand.js';
import { variations } from '../names/variations.js';
import { checkAll, type NameResult } from '../names/check.js';

const VALID_NAME = /^[a-z0-9]+$/i;
/** Above this many names we ask for --yes, to avoid an accidental multi-hour run. */
const CONFIRM_THRESHOLD = 200;
/** Hard ceiling on materialized candidates, to avoid OOM on something like `****` + --variations. */
const HARD_MAX = 100_000;

interface NamesOptions {
	file?: string;
	variations?: boolean;
	rate: number;
	limit?: number;
	availableOnly?: boolean;
	yes?: boolean;
}

export function names(program: Command): void {
	program
		.command('names [inputs...]')
		.description('Check IMVU username availability for names or patterns.')
		.addHelpText(
			'after',
			[
				'',
				'Inputs are literal names or patterns. Pattern tokens:',
				'  *      any alphanumeric (a-z 0-9)',
				'  @      any letter (a-z)',
				'  #      any digit (0-9)',
				'  [..]   an explicit set, with ranges: [abc], [a-f], [a-f0-9]',
				'',
				'Examples:',
				'  imvu-tools names bob                 # single name',
				'  imvu-tools names bob alice carol     # several names',
				'  imvu-tools names "b@b"               # bab..bzb (letters only)',
				'  imvu-tools names "@@@"               # every 3-letter name',
				'  imvu-tools names "***"               # every 3-char name (needs --yes)',
				'  imvu-tools names bill --variations   # bill + look-alikes (biII, b1ll, …)',
				'  cat names.txt | imvu-tools names     # newline-separated from stdin',
			].join('\n')
		)
		.option('-f, --file <path>', 'read newline-separated names/patterns from a file')
		.option('-v, --variations', 'also check homoglyph look-alikes (e.g. a capital I for l)')
		.option('-r, --rate <n>', 'requests per second', (value) => Number(value), 2)
		.option('-l, --limit <n>', 'cap the number of names checked', (value) => Number(value))
		.option('-a, --available-only', 'only print names that are available')
		.option('-y, --yes', `proceed without confirmation above ${CONFIRM_THRESHOLD} names`)
		.action(async (inputs: string[], options: NamesOptions) => {
			const raw = [...inputs];
			if (options.file) {
				raw.push(...readLines(readFileSync(options.file, 'utf8')));
			}
			if (!process.stdin.isTTY) {
				raw.push(...readLines(await readStdin()));
			}

			if (raw.length === 0) {
				fail('No names given. Pass names/patterns as arguments, --file <path>, or pipe them via stdin.');
			}

			let candidates: string[];
			try {
				candidates = dedupe(buildCandidates(raw, Boolean(options.variations)));
			} catch (error) {
				fail(error instanceof Error ? error.message : String(error));
			}

			if (options.limit !== undefined && Number.isFinite(options.limit)) {
				candidates = candidates.slice(0, options.limit);
			}

			if (candidates.length === 0) {
				fail('No valid names to check.');
			}

			if (candidates.length > CONFIRM_THRESHOLD && !options.yes && options.limit === undefined) {
				fail(
					`${candidates.length} names to check (> ${CONFIRM_THRESHOLD}). Re-run with --yes, or narrow it with --limit <n>.`
				);
			}

			if (!process.env.IMVU_USERNAME) {
				fail('Set IMVU_USERNAME / IMVU_PASSWORD (see examples/README.md).');
			}

			const client = new Client();
			await client.login(process.env.IMVU_USERNAME, process.env.IMVU_PASSWORD ?? '');

			console.error(`Checking ${candidates.length} name(s) at ~${options.rate}/s…\n`);

			let available = 0;
			await checkAll(client, candidates, {
				rate: options.rate,
				onResult: (result) => {
					if (result.status === 'available') {
						available += 1;
					}
					if (options.availableOnly && result.status !== 'available') {
						return;
					}
					console.log(formatResult(result));
				},
			});

			console.error(`\nDone — ${available}/${candidates.length} available.`);
		});
}

/** Expand every input (literal or pattern) into concrete names, plus optional look-alikes. */
function buildCandidates(inputs: string[], withVariations: boolean): string[] {
	const out: string[] = [];
	const push = (name: string): void => {
		if (out.length >= HARD_MAX) {
			throw new Error(`Too many candidates (> ${HARD_MAX}); narrow your patterns.`);
		}
		out.push(name);
	};

	for (const input of inputs) {
		let base: string[];
		if (isPattern(input)) {
			const count = countPattern(input);
			if (count > HARD_MAX) {
				throw new Error(`Pattern "${input}" expands to ${count} names (> ${HARD_MAX}); narrow it.`);
			}
			base = expandPattern(input);
		} else if (VALID_NAME.test(input)) {
			base = [input.toLowerCase()];
		} else {
			throw new Error(`Invalid name "${input}" — names must be alphanumeric (or use pattern tokens * @ # [ ]).`);
		}

		for (const name of base) {
			push(name);
			if (withVariations) {
				for (const variant of variations(name)) {
					push(variant);
				}
			}
		}
	}

	return out;
}

function dedupe(names: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const name of names) {
		const key = name.toLowerCase();
		if (!seen.has(key)) {
			seen.add(key);
			out.push(name);
		}
	}
	return out;
}

function formatResult(result: NameResult): string {
	if (result.status === 'error') {
		return `${result.name} - ERROR (${result.error})`;
	}
	return `${result.name} - ${result.status.toUpperCase()}`;
}

function readLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
