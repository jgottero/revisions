/* The verb to have, and the traps of the French → English quiz.

   The sixième's notebook: every person says "have" except the third
   person singular, which says "has" — and in the negative and the
   question the s moves onto the auxiliary: doesn't have, Does she have?

   The list gives each word the mistakes that rule invites ("She
   doesn't has", "Does she has?", "I has"), and the quiz offers one or
   two of them among its three wrong choices. This suite checks that:
     - the list is on the sixième's menu, with its 24 items;
     - a question always has four different choices, one of them right,
       one or two of them traps, and never a trap among the answers;
     - the reverse quiz and the other lists are left as they were;
     - a written answer is accepted with or without its apostrophe and
       question mark, and a trap is not. */
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

// ---- the list is on the sixième's menu, right after to be ----
const menu = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-lesson]')).map(b => b.dataset.lesson));
console.log('the sixième menu:', JSON.stringify(menu));
if (menu.indexOf('have') === -1) errors.push('the list "have" is not on the menu');
else if (menu.indexOf('have') !== menu.indexOf('be') + 1) errors.push('"have" does not follow "be"');

const list = await page.evaluate(() => {
  const have = LESSONS.find(l => l.id === 'have');
  return {
    count: have.words.length,
    keys: new Set(have.words.map(w => w.key)).size,
    third: have.words.filter(w => /^(He|She|It) /.test(w.en[0]) || / (he|she|it) /.test(w.en[0]))
      .map(w => w.en[0]),
    trapsThatAreRight: have.words.flatMap(w => (w.traps || []).filter(t =>
      have.words.some(o => o.en.includes(t))))
  };
});
console.log('items:', list.count, '· distinct keys:', list.keys);
console.log('third person singular:', JSON.stringify(list.third));
if (list.count !== 24) errors.push('the list should hold 24 items, not ' + list.count);
if (list.keys !== list.count) errors.push('two items share a key');
if (list.third.length !== 9) errors.push('expected 9 third-person items');
if (list.third.some(e => !/^(He|She|It) has$|doesn't have$|^Does (he|she|it) have\?$/.test(e))) {
  errors.push('a third-person answer is wrong: ' + list.third.join(', '));
}
if (list.trapsThatAreRight.length) errors.push('a trap is a right answer elsewhere: ' + list.trapsThatAreRight);

// ---- the French → English quiz offers one or two traps, never more ----
const forward = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'have').words;
  const found = { trapCounts: {}, bad: [], sample: null };
  for (let i = 0; i < 300; i++) {
    pool.forEach(w => {
      const q = buildForward(w, pool);
      const traps = q.options.filter(o => w.traps.includes(o)).length;
      found.trapCounts[traps] = (found.trapCounts[traps] || 0) + 1;
      if (q.options.length !== 4) found.bad.push(w.fr + ': ' + q.options.length + ' choices');
      if (new Set(q.options).size !== 4) found.bad.push(w.fr + ': a choice twice');
      if (q.options.filter(o => w.en.includes(o)).length !== 1) found.bad.push(w.fr + ': not one right answer');
      if (w.fr === "Elle n'a pas (fille ou animal)" && !found.sample) found.sample = q.options;
    });
  }
  return found;
});
console.log('traps per question:', JSON.stringify(forward.trapCounts));
console.log("« Elle n'a pas » offers:", JSON.stringify(forward.sample));
if (forward.trapCounts[0] || forward.trapCounts[3]) errors.push('a question has no trap, or only traps');
if (!forward.trapCounts[1] || !forward.trapCounts[2]) errors.push('one and two traps should both turn up');
if (forward.bad.length) errors.push(...new Set(forward.bad));

// ---- tu and vous both say "You have": neither is a wrong answer for the other ----
const you = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'have').words;
  const tu = pool.find(w => w.fr === 'Tu as');
  const wrong = [];
  for (let i = 0; i < 300; i++) {
    const q = buildReverse(tu, pool);
    if (q.prompt === 'You have' && q.options.includes('Vous avez')) wrong.push('reverse offers Vous avez');
  }
  return wrong;
});
if (you.length) errors.push('"Vous avez" is offered as wrong for "You have"');

// ---- a list without traps draws its wrong choices as before ----
const others = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'be').words;
  const bad = [];
  for (let i = 0; i < 200; i++) {
    pool.forEach(w => {
      const q = buildForward(w, pool);
      if (q.options.length !== 4) bad.push(w.fr);
      if (q.options.some(o => !pool.some(p => p.en.includes(o)))) bad.push(w.fr + ' has an outsider');
    });
  }
  return [...new Set(bad)];
});
console.log('to be, untouched:', others.length ? JSON.stringify(others) : 'yes');
if (others.length) errors.push('the list "be" changed: ' + others.join(', '));

// ---- written answers: apostrophe and question mark are optional, a trap is wrong ----
const written = await page.evaluate(() => {
  const pool = LESSONS.find(l => l.id === 'have').words;
  const she = pool.find(w => w.fr === "Est-ce qu'elle a ? (fille ou animal)");
  const not = pool.find(w => w.fr === "Elle n'a pas (fille ou animal)");
  return {
    'Does she have?': isAccepted(she, 'Does she have?'),
    'does she have': isAccepted(she, 'does she have'),
    'Does she has?': isAccepted(she, 'Does she has?'),
    "she doesn't have": isAccepted(not, "she doesn't have"),
    'she doesnt have': isAccepted(not, 'she doesnt have'),
    "she doesn't has": isAccepted(not, "she doesn't has"),
    "she don't have": isAccepted(not, "she don't have")
  };
});
console.log('written answers:', JSON.stringify(written));
for (const [typed, ok] of Object.entries(written)) {
  const shouldBe = !/has\??$|don't/.test(typed);
  if (ok !== shouldBe) errors.push('"' + typed + '" is ' + (ok ? 'accepted' : 'refused'));
}

// ---- a real round, in the French → English quiz ----
await page.evaluate(() => { state.mode = 'mcq'; startRound('have'); });
await page.waitForTimeout(300);
const shown = await page.evaluate(() => ({
  prompt: document.getElementById('prompt').textContent,
  choices: Array.from(document.querySelectorAll('#body button')).map(b => b.textContent.trim())
}));
console.log('on screen:', JSON.stringify(shown));
if (shown.choices.length < 4) errors.push('the round shows ' + shown.choices.length + ' choices');
await page.screenshot({ path: SHOTS + 'v59-have.png', fullPage: true });

await browser.close();
if (errors.length) {
  console.log('BROKEN');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('no errors');
