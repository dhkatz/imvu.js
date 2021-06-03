import {Client} from "../src";

async function main(): Promise<void> {
  const input = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z' ];

  function combinations(input: string[], length: number, curstr: string): string[] {
    if(curstr.length == length) return [ curstr ];
    const ret: string[] = [];
    for(let i = 0; i < input.length; i++) {
      ret.push(...combinations(input, length, curstr + input[i]));
    }
    return ret;
  }

  const words = combinations(input, 4, '')
    .filter(s => s.charCodeAt(0) > 115);

  const client = new Client();
  let count = 0;

  for (const word of words) {
    const available = await client.users.available(word);

    if (++count % 100 === 0) {
      console.log(`[UPDATE] Processed ${count}`);
    }

    if (available) {
      console.log(`[FOUND] ${word}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

main();
