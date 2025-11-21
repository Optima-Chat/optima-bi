import chalk from 'chalk';
import { table } from 'table';

export enum OutputFormat {
  JSON = 'json',
  PRETTY = 'pretty',
}

export function outputJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

export function outputPretty(data: any, headers?: string[]): void {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.yellow('No data found.'));
      return;
    }

    const keys = headers || Object.keys(data[0]);
    const rows = [keys.map((k) => chalk.bold(k))];

    data.forEach((item) => {
      rows.push(keys.map((k) => String(item[k] || '')));
    });

    console.log(table(rows));
  } else {
    // Single object
    const rows: string[][] = [];
    Object.entries(data).forEach(([key, value]) => {
      rows.push([chalk.bold(key), String(value)]);
    });
    console.log(table(rows));
  }
}

export function success(message: string): void {
  console.log(chalk.green('✓ ' + message));
}

export function error(message: string): void {
  console.error(chalk.red('✗ ' + message));
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ ' + message));
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠ ' + message));
}
