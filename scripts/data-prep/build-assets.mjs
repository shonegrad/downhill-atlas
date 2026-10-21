// Orchestrates the data pipeline for one or more locations:
//   npm run prep:data              -> all locations
//   npm run prep:data -- kopaonik  -> single location

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LOCATION_ORDER, LOCATIONS } from './config.mjs';

const run = (script, args = []) => {
  console.log(`\n=== ${script} ${args.join(' ')} ===`);
  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
};

const locationIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...LOCATION_ORDER];

for (const id of locationIds) {
  if (!LOCATIONS[id]) throw new Error(`unknown location ${id}`);
  run('fetch-osm.mjs', [id]);
  run('build-terrain.mjs', [id]);
  run('assemble-route.mjs', [id]);
  run('export-context.mjs', [id]);
  run('write-manifest.mjs', [id]);
}

run('write-locations.mjs');
console.log('\ndata pipeline complete');
