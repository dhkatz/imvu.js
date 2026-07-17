import { Command } from 'commander';
import { products } from './cli/products.js';

const program = new Command();

program.name('imvu-tools').description('CLI utilities for the IMVU API.');

products(program);

program.parse();
