#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code ?? 0;
}).catch((error) => {
  console.error(`shipgate: ${error.message}`);
  process.exitCode = 2;
});
