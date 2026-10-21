import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.QA_BASE ?? 'http://localhost:5300';
const OUT = process.env.QA_OUT ?? '/var/folders/7r/75czf7515qs_7pyxb08wd91r0000gn/T/opencode/qa-shots';
mkdirSync(OUT, { recursive: true });

const problems = [];
function report(msg) {
  problems.push(msg);
  console.error('PROBLEM: ' + msg);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=1280,800', '--no-first-run'],
  defaultViewport: { width: 1280, height: 800 },
});

for (const loc of ['streif', 'kopaonik']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });

  const url = `${BASE}/?loc=${loc}`;
  console.log(`--- ${loc}: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  try {
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && hidden(loading) && document.querySelector('#app.ready');
      function hidden(n) { return n.hidden === true; }
    }, { timeout: 30000 });
  } catch {
    report(`[${loc}] scene never became ready`);
  }

  // overview
  await page.screenshot({ path: `${OUT}/${loc}-1-overview.png` });

  // panels populated?
  const facts = await page.$eval('#facts', (n) => n.textContent.length);
  const legend = await page.$eval('#legend', (n) => n.textContent.length);
  if (facts < 40) report(`[${loc}] facts panel suspiciously short (${facts} chars)`);
  if (legend < 40) report(`[${loc}] legend panel suspiciously short (${legend} chars)`);

  // landmarks button only on streif
  const hasLandmarksBtn = await page.$eval('#btn-landmarks', (n) => !n.hidden);
  if ((loc === 'streif') !== hasLandmarksBtn) report(`[${loc}] landmarks button visibility wrong (visible=${hasLandmarksBtn})`);

  // click across a grid of sample points -> selection panel on a feature hit
  let selVisible = false;
  let selText = '';
  const pts = [];
  for (let gy = 220; gy <= 680; gy += 90) {
    for (let gx = 360; gx <= 1080; gx += 90) pts.push([gx, gy]);
  }
  for (const [gx, gy] of pts) {
    await page.mouse.click(gx, gy);
    await new Promise((r) => setTimeout(r, 250));
    selVisible = await page.$eval('#selection-panel', (n) => !n.hidden);
    if (selVisible) break;
    await page.keyboard.press('Escape');
  }
  console.log(`    selection panel after sample clicks: ${selVisible}`);
  await page.screenshot({ path: `${OUT}/${loc}-2-selection.png` });
  if (selVisible) {
    selText = await page.$eval('#selection-panel', (n) => n.textContent);
    if (!selText.includes('OSM way')) report(`[${loc}] selection panel lacks provenance line`);
    await page.keyboard.press('Escape');
  }

  // legend toggles: flip first row off and on
  await page.click('#legend .legend-item');
  await new Promise((r) => setTimeout(r, 200));
  const pressed = await page.$eval('#legend .legend-item', (n) => n.getAttribute('aria-pressed'));
  if (pressed !== 'false') report(`[${loc}] legend toggle did not unpress`);
  await page.click('#legend .legend-item');
  await new Promise((r) => setTimeout(r, 200));

  // camera presets
  await page.click('#btn-top-down');
  await page.screenshot({ path: `${OUT}/${loc}-3-topdown.png` });
  await page.click('#btn-course-start');
  await page.screenshot({ path: `${OUT}/${loc}-4-course-start.png` });
  await page.click('#btn-reset');

  // guided descent: play, mid-flight screenshot, pause/resume, wait for end
  await page.click('#btn-play');
  await new Promise((r) => setTimeout(r, 3000));
  const playing = await page.$eval('#btn-pause', (n) => !n.hidden);
  if (!playing) report(`[${loc}] pause button not visible during descent`);
  const selDuringDescent = await page.$eval('#selection-panel', (n) => !n.hidden);
  if (selDuringDescent) report(`[${loc}] selection panel still open during descent`);
  await page.screenshot({ path: `${OUT}/${loc}-5-descent.png` });
  await page.click('#btn-pause'); // pause
  await page.click('#btn-pause'); // resume
  try {
    await page.waitForFunction(
      () => document.getElementById('btn-play') && document.getElementById('btn-play').hidden === false,
      { timeout: 120000 },
    );
  } catch {
    report(`[${loc}] descent never returned to overview`);
  }
  await page.screenshot({ path: `${OUT}/${loc}-6-after-descent.png` });

  if (errors.length) {
    report(`[${loc}] ${errors.length} page error(s): ${errors.slice(0, 6).join(' | ')}`);
  } else {
    console.log(`    no console/page errors`);
  }
  await page.close();
}

// fresh user path: default URL, no ?loc
const page = await browser.newPage();
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
const selectValue = await page.$eval('#location-select', (n) => n.value);
console.log(`default location selected: ${selectValue}`);
if (!selectValue) report('location select empty on default URL');

await browser.close();
if (problems.length) {
  console.error(`\nFAIL — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('\nPASS — all smoke checks OK; screenshots in ' + OUT);
