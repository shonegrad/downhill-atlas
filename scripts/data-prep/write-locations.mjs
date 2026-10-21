// Writes public/data/locations.json — the small index the UI select is built on.
// Adding a resort later requires only: a config entry, an extract, and assets.

import { OUT_BASE, writeJson } from './lib.mjs';
import { LOCATIONS, LOCATION_ORDER } from './config.mjs';

const locations = LOCATION_ORDER.map((id) => {
  const loc = LOCATIONS[id];
  return {
    id: loc.id,
    dir: loc.dir,
    display: loc.display,
    featuredName: loc.featuredNameLatin ?? loc.featuredName,
    featuredNameSource: loc.featuredName,
    featuredSubtitle: loc.featuredSubtitle,
    featuredDifficulty: loc.featuredDifficulty,
    hasOfficialFacts: Boolean(loc.officialFacts),
  };
});

writeJson(`${OUT_BASE}/locations.json`, {
  format: 'downhill-atlas-locations/1',
  default: 'streif',
  locations,
});
console.log('locations index written');
