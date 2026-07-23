import { Command } from 'commander';
import { names } from './cli/names.js';
import { products } from './cli/products.js';

const program = new Command();

program.name('imvu-tools').description('CLI utilities for the IMVU API.');

names(program);
products(program);

program.parse();
