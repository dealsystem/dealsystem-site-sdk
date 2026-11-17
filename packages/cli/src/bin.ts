#!/usr/bin/env node
import { run } from './cli/main.js';
import { nodeIO } from './cli/io.js';

process.exitCode = await run(process.argv.slice(2), nodeIO());
