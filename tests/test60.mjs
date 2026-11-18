/* Family members.

   The sixième's notebook: father, mother, son, daughter, uncle, cousin,
   grandmother, grandfather, then children, stepfather, aunt, only child,
   husband and wife. This suite checks that the list is on the sixième's
   menu with its fourteen words, that "childs" is offered as a trap, that a question draws four
   different choices from it, and that the compound words are spelt as
   one: "grandmother", never "grand-mother" or "grand mother". */
import { chromium } from 'playwright';
/* Where to find the browser, the pages and somewhere to drop the
   screenshots. The defaults are the ones tests/run.mjs sets up; every
   one of them can be pointed elsewhere from the environment. */
const BROWSER = process.env.CHROMIUM || undefined;   // undefined: the one Playwright brought
const SITE = process.env.SITE || 'http://localhost:8123';
const SHOTS = process.env.SHOTS || new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => {
  const text = m.text();
  if (m.type() === 'error' && !/CERT|favicon|fonts\.g|404/.test(text)) errors.push('CONSOLE ' + text);
});

await page.goto(SITE + '/index.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(700);
await page.evaluate(() => startAs(PROFILES.create('Léo', '6eme').id));
await page.waitForTimeout(300);

// ---- the list is on the sixième's menu, with the notebook's fourteen words ----
const menu = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-lesson]')).map(b => b.dataset.lesson));
console.log('the sixième menu:', JSON.stringify(menu));
if (menu.indexOf('family') === -1) errors.push('the list "family" is not on the menu');

const words = await page.evaluate(() =>
  LESSONS.find(l => l.id === 'family').words.map(w => w.fr + '=' + w.en[0]));
console.log('family members:', JSON.stringify(words));
for (const pair of ['Père=father', 'Mère=mother', 'Fils=son', 'Fille=daughter', 'Oncle=uncle',
  'Cousin / cousine=cousin', 'Grand-mère=grandmother', 'Grand-père=grandfather',
  'Enfants=children', 'Beau-père=stepfather', 'Tante=aunt', 'Enfant unique=only child',
  'Époux (le mari)=husband', 'Épouse (la femme)=wife']) {
  if (words.indexOf(pair) === -1) errors.push('missing word ' + pair);
}
if (words.length !== 14) errors.push('the list should hold 14 words, not ' + words.length);

// ---- every question offers four different choices, one of them right ----
const bad = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'family').words;
  const found = [];
  for (let i = 0; i < 200; i++) {
    pool.forEach(w => {
      for (const q of [buildForward(w, pool), buildReverse(w, pool)]) {
        if (new Set(q.options).size !== 4) found.push(w.fr + ': ' + JSON.stringify(q.options));
        if (!q.options.includes(q.answer)) found.push(w.fr + ': the answer is missing');
      }
    });
  }
  return [...new Set(found)];
});
if (bad.length) errors.push(...bad);

// ---- "Enfants" offers a wrong plural among its choices ----
const trapped = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'family').words;
  const children = pool.find(w => w.fr === 'Enfants');
  let seen = 0;
  for (let i = 0; i < 50; i++) {
    const q = buildForward(children, pool);
    if (q.options.some(o => o === 'childs' || o === 'childrens')) seen++;
  }
  return seen;
});
console.log('"Enfants" questions offering childs/childrens:', trapped, '/ 50');
if (trapped < 50) errors.push('"Enfants" does not always offer a wrong plural');

// ---- the dictation wants the compound words in one piece ----
await page.evaluate(() => { state.mode = 'spell'; startRound('family'); });
await page.waitForTimeout(300);
const spelt = await page.evaluate(() => {
  const grandmother = LESSONS.find(l => l.id === 'family').words.find(w => w.fr === 'Grand-mère');
  const check = typed => grandmother.en.some(a => normalise(a) === normalise(typed));
  return {
    grandmother: check('grandmother'),
    Grandmother: check('Grandmother'),
    'grand-mother': check('grand-mother'),
    'grand mother': check('grand mother')
  };
});
console.log('spelt:', JSON.stringify(spelt));
if (!spelt.grandmother || !spelt.Grandmother) errors.push('"grandmother" is refused');
if (spelt['grand-mother'] || spelt['grand mother']) errors.push('a split "grand mother" is accepted');
await page.screenshot({ path: SHOTS + 'v60-family.png', fullPage: true });

await browser.close();
if (errors.length) {
  console.log('BROKEN');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('no errors');
