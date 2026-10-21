// Writes public/data/locations.json — the small index the UI select is built on.
// Adding a resort later requires only: a config entry, an extract, and assets.

import fs from 'node:fs';
import { OUT_BASE, outDirOf, writeJson } from './lib.mjs';
import { LOCATIONS, LOCATION_ORDER } from './config.mjs';

const coursesOf = (loc) => {
  try {
    return JSON.parse(fs.readFileSync(`${outDirOf(loc)}/routes/index.json`, 'utf8')).courses;
  } catch {
    return null;
  }
};

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
    courses: coursesOf(loc),
  };
});

writeJson(`${OUT_BASE}/locations.json`, {
  format: 'downhill-atlas-locations/1',
  default: 'streif',
  locations,
});
console.log('locations index written');
