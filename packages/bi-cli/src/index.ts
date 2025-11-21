#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth';
import { createSalesCommand } from './commands/sales';
import packageJson from '../package.json';

const program = new Command();

program
  .name('bi-cli')
  .description('Optima BI CLI - AI-friendly business intelligence tool')
  .version(packageJson.version);

// Auth commands
program.addCommand(createAuthCommand());

// Sales commands
program.addCommand(createSalesCommand());

// Config commands (placeholder)
program
  .command('config')
  .description('Manage configuration')
  .action(() => {
    console.log('Config management coming soon...');
  });

// Customer commands (placeholder)
program
  .command('customer')
  .description('Customer analytics')
  .action(() => {
    console.log('Customer analytics coming soon...');
  });

// Inventory commands (placeholder)
program
  .command('inventory')
  .description('Inventory analytics')
  .action(() => {
    console.log('Inventory analytics coming soon...');
  });

// Product commands (placeholder)
program
  .command('product')
  .description('Product analytics')
  .action(() => {
    console.log('Product analytics coming soon...');
  });

// Platform commands (admin only - placeholder)
program
  .command('platform')
  .description('Platform analytics (admin only)')
  .action(() => {
    console.log('Platform analytics coming soon...');
  });

program.parse();
