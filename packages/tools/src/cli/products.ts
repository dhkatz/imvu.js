import { Command } from 'commander';

export function products(program: Command) {
  const command = program.command('products');

  command
    .command('download')
    .description('Download the CHKN file for product(s)')
    .option('-p, --products <products>', 'Product to download')
    .action(async (options) => {
      const { products } = options;
    });
}
