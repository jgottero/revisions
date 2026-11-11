/* The time, and more school subjects.

   The sixième's notebook adds five subjects (history, art, music,
   chemistry, biology) and two more its sentences use (physics, French),
   then a timetable written the English way: "We have history at
   9:30 am". The French side of a time is the 24-hour clock — 14 h — so
   the lesson is the step from one to the other: am or pm, and 14 − 12.

   A time is asked three ways, drawn question by question:
     mcq       "14 h", and four times to choose from, the wrong ones
               being the mistakes a pupil makes (2 am, 4 pm, 9:13)
     clock     the time is heard, and typed with am or pm
     sentence  "Nous avons histoire à 9 h 30.", four English sentences
   A telephone with no English voice never draws the second. */
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

// An English voice, and every utterance written down instead of spoken.
const pretendVoices = list => page.evaluate(voices => {
  window.__said = [];
  window.speechSynthesis.getVoices = () => voices;
  window.speechSynthesis.speak = one => window.__said.push(one.text);
  window.speechSynthesis.cancel = () => {};
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  pickVoice();
}, list);

await page.goto(SITE + '/index.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(700);
await pretendVoices([{ name: 'UK', lang: 'en-GB' }]);
await page.evaluate(() => startAs(PROFILES.create('Léo', '6eme').id));
await page.waitForTimeout(300);

// ---- both lists are on the sixième's menu ----
const menu = await page.evaluate(() => ({
  lists: Array.from(document.querySelectorAll('[data-lesson]')).map(b => b.dataset.lesson),
  counted: Array.from(document.querySelectorAll('[data-lesson]'))
    .map(b => b.dataset.lesson + ': ' + (b.querySelector('.sub') || b).textContent.trim())
}));
console.log('the sixième menu:', JSON.stringify(menu.lists));
console.log('counted:', JSON.stringify(menu.counted.filter(one => /time|more-school/.test(one))));
for (const id of ['more-school-subjects', 'time']) {
  if (menu.lists.indexOf(id) === -1) errors.push('the list ' + id + ' is not on the menu');
}

// ---- the subjects ----
const subjects = await page.evaluate(() =>
  LESSONS.find(l => l.id === 'more-school-subjects').words.map(w => w.fr + '=' + w.en[0]));
console.log('more school subjects:', JSON.stringify(subjects));
for (const pair of ['Histoire=history', 'Arts plastiques=art', 'Musique=music', 'Chimie=chemistry',
  'SVT=biology', 'Physique=physics', 'Français=French']) {
  if (subjects.indexOf(pair) === -1) errors.push('missing subject ' + pair);
}
/* "science" is never a wrong choice for chemistry, biology or physics,
   nor are they wrong choices when "science" is asked. */
const sciences = await page.evaluate(() => {
  const all = LESSONS.flatMap(l => l.words);
  const pool = all.filter(w => /school-subjects/.test(w.key));
  const found = [];
  for (let i = 0; i < 200; i++) {
    pool.filter(w => w.avoid && w.avoid.includes('science')).forEach(w => {
      const q = buildForward(w, pool);
      if (q.options.some(o => /^sciences?$/.test(o))) found.push('forward ' + w.fr);
    });
    const science = pool.find(w => w.fr === 'Science');
    const back = buildReverse(Object.assign({}, science, { en: ['science'] }), pool);
    if (back.options.some(o => /Chimie|SVT|Physique/.test(o))) found.push('reverse science');
  }
  return found;
});
if (sciences.length) errors.push('science offered against a science: ' + sciences.slice(0, 3).join(', '));

// ---- every time agrees with its French ----
const times = await page.evaluate(() => LESSONS.find(l => l.id === 'time').words.map(w => {
  const french = CLOCK.fromFrench(w.fr);
  const english = CLOCK.read(w.en[0]);
  const twelve = CLOCK.to12(french.h24);
  return {
    fr: w.fr, en: w.en[0],
    agrees: !!english && english.h12 === twelve.h12 && english.half === twelve.half &&
      english.min === french.min && CLOCK.write(english) === w.en[0],
    traps: CLOCK.traps(w),
    how: CLOCK.how(w)
  };
}));
times.forEach(t => console.log('  ' + t.fr.padEnd(8) + t.en.padEnd(10) + JSON.stringify(t.traps) + '  ' + t.how));
times.filter(t => !t.agrees).forEach(t => errors.push(t.fr + ' does not say the same time as ' + t.en));
times.filter(t => t.traps.length !== 3 || new Set(t.traps).size !== 3 || t.traps.includes(t.en))
  .forEach(t => errors.push('bad wrong choices for ' + t.fr + ': ' + JSON.stringify(t.traps)));
const two = times.find(t => t.fr === '14 h');
if (!two || two.traps.join() !== '2 am,4 pm,1 pm') errors.push('14 h is not offered the usual mistakes');
const nine = times.find(t => t.fr === '9 h 30');
if (!nine || nine.traps.indexOf('9:13 am') === -1) errors.push('9:30 is not offered 9:13');

// ---- what a typed time is allowed to look like ----
const typed = await page.evaluate(() => {
  const nine = { en: ['9:30 am'] };
  const two = { en: ['2 pm'] };
  return {
    right: ['9:30 am', '9:30am', '9.30 am', '9h30 am', '9:30 a.m.', '9:30 AM', ' 9 : 30 am']
      .filter(a => !CLOCK.matches(nine, a)),
    rightToo: ['2 pm', '2pm', '2:00 pm', '2 p.m.'].filter(a => !CLOCK.matches(two, a)),
    wrong: ['9:30', '9:30 pm', '9:13 am', '930', '21:30', 'nine thirty']
      .filter(a => CLOCK.matches(nine, a)),
    hints: ['9:30', '9:30 pm', '9:13 am', 'blah'].map(a => CLOCK.hint(nine, a))
  };
});
console.log('typed answers:', JSON.stringify(typed));
if (typed.right.length || typed.rightToo.length) errors.push('a right time refused: ' + typed.right.concat(typed.rightToo));
if (typed.wrong.length) errors.push('a wrong time accepted: ' + typed.wrong);
if (!/am ou pm/.test(typed.hints[0])) errors.push('no word about a missing am or pm');
if (!/thirteen/.test(typed.hints[2])) errors.push('no word about thirty and thirteen');

// ---- a round draws the three ways ----
const drawn = await page.evaluate(() => {
  const seen = {};
  for (let i = 0; i < 20; i++) {
    startRound('time');
    state.round.forEach(q => { seen[q.mode] = (seen[q.mode] || 0) + 1; });
  }
  return seen;
});
console.log('over twenty rounds:', JSON.stringify(drawn));
if (!drawn.mcq || !drawn.clock || !drawn.sentence || Object.keys(drawn).length !== 3) {
  errors.push('the three ways are not all drawn, or something else is: ' + JSON.stringify(drawn));
}

const ask = mode => page.evaluate(([mode, fr]) => {
  startRound('time');
  const word = LESSONS.find(l => l.id === 'time').words.find(w => w.fr === fr);
  const q = mode === 'mcq' ? CLOCK.choice(word) : mode === 'sentence' ? CLOCK.sentence(word)
    : { word, prompt: '' };
  q.mode = mode;
  state.round = [q];
  state.index = 0;
  window.__said = [];
  renderShell();
  showQuestion();
}, [mode, mode === 'sentence' ? '9 h 30' : '14 h']);

// ---- A: the time out of four ----
await ask('mcq');
await page.waitForTimeout(300);
const choice = await page.evaluate(() => ({
  prompt: document.getElementById('prompt').textContent,
  choices: Array.from(document.querySelectorAll('#options .option .word')).map(b => b.textContent)
}));
console.log('A, out of four:', JSON.stringify(choice));
if (choice.prompt !== '14 h') errors.push('the time is not asked in French');
if (choice.choices.slice().sort().join() !== '1 pm,2 am,2 pm,4 pm') errors.push('unexpected choices');
await page.screenshot({ path: SHOTS + 'v58-choice.png', fullPage: true });
await page.click('#options .option:has(.word:text-is("2 am"))');
await page.waitForTimeout(300);
const missed = await page.evaluate(() => ({
  verdict: document.getElementById('verdict').textContent.replace(/\s+/g, ' ').trim(),
  said: window.__said.slice(-1)[0]
}));
console.log('a wrong one:', JSON.stringify(missed));
if (!/14 − 12 = 2/.test(missed.verdict)) errors.push('the mistake is not explained');
if (missed.said !== '2 A.M.') errors.push('am is not read as two letters: ' + missed.said);
await page.screenshot({ path: SHOTS + 'v58-choice-wrong.png', fullPage: true });

// ---- B: heard, then typed ----
await ask('clock');
await page.waitForTimeout(300);
const heard = await page.evaluate(() => ({
  asking: state.asking,
  said: window.__said.slice(-1)[0],
  nothingWritten: document.getElementById('prompt').hidden,
  canHearItAgain: !!document.getElementById('hear')
}));
console.log('B, heard:', JSON.stringify(heard));
if (heard.said !== '2 P.M.') errors.push('the time was not read out: ' + heard.said);
if (!heard.nothingWritten) errors.push('the listening question writes the time down');
await page.fill('#typed', '2');
await page.click('#check');
await page.waitForTimeout(300);
const typedWrong = await page.evaluate(() => ({
  verdict: document.getElementById('verdict').textContent.replace(/\s+/g, ' ').trim(),
  copy: document.getElementById('typed').placeholder
}));
console.log('without am or pm:', JSON.stringify(typedWrong));
if (!/am ou pm/.test(typedWrong.verdict)) errors.push('a missing am or pm is not pointed out');
if (typedWrong.copy !== 'Recopie : 2 pm') errors.push('not asked to copy the answer out');
await page.fill('#typed', '2:00 pm');
await page.click('#check');
await page.waitForTimeout(300);
if (!(await page.evaluate(() => document.getElementById('typed').disabled))) {
  errors.push('copying the time out did not let the pupil on');
}

// ---- C: the timetable sentence ----
await ask('sentence');
await page.waitForTimeout(300);
const sentence = await page.evaluate(() => ({
  prompt: document.getElementById('prompt').textContent,
  choices: Array.from(document.querySelectorAll('#options .option .word')).map(b => b.textContent),
  answer: state.round[0].answer
}));
console.log('C, a sentence:', JSON.stringify(sentence));
if (!/^Nous (avons .+|déjeunons) à 9 h 30\.$/.test(sentence.prompt)) errors.push('odd French sentence');
if (/déjeunons/.test(sentence.prompt)) errors.push('lunch at half past nine');
if (!/^We have .+ at 9:30 am\.$/.test(sentence.answer)) errors.push('odd English sentence');
if (sentence.choices.length !== 4 || new Set(sentence.choices).size !== 4) errors.push('not four different sentences');
if (!sentence.choices.some(c => /9:30 pm/.test(c))) errors.push('no pm among the wrong sentences');
await page.screenshot({ path: SHOTS + 'v58-sentence.png', fullPage: true });
await page.click('#options .option:has(.word:text-is("' + sentence.answer + '"))');
await page.waitForTimeout(300);
const rightSentence = await page.evaluate(() => ({
  verdict: document.getElementById('verdict').textContent.replace(/\s+/g, ' ').trim(),
  said: window.__said.slice(-1)[0]
}));
console.log('the right one:', JSON.stringify(rightSentence));
if (!/^Bravo\. Nous [^.]+ = We have .+ 9:30 am\./.test(rightSentence.verdict)) errors.push('odd verdict');
if (rightSentence.said !== 'We have ' + sentence.answer.slice(8, -4) + ' A.M.') errors.push('odd reading: ' + rightSentence.said);
if (/On accepte aussi/.test(rightSentence.verdict)) errors.push('the time is offered as a synonym of the sentence');

// Lunch only where it belongs.
const lunch = await page.evaluate(() => {
  const words = LESSONS.find(l => l.id === 'time').words;
  const bad = [];
  for (let i = 0; i < 300; i++) {
    words.forEach(w => {
      const q = CLOCK.sentence(w);
      const h = CLOCK.fromFrench(w.fr).h24;
      if (/lunch/.test(q.answer) && (h < 11 || h > 13)) bad.push(w.fr);
    });
  }
  return bad;
});
if (lunch.length) errors.push('lunch at ' + lunch[0]);

// ---- times stay among times ----
const strays = await page.evaluate(() => {
  const pool = LESSONS.flatMap(l => l.words);
  const found = [];
  for (let i = 0; i < 100; i++) {
    pool.filter(w => !w.clock && !w.ask).slice(0, 40).forEach(w => {
      if (buildForward(w, pool).options.some(o => /\d (am|pm)$/.test(o))) found.push(w.fr);
      if (buildReverse(w, pool).options.some(o => /^\d+ h/.test(o))) found.push(w.fr);
    });
  }
  return found;
});
if (strays.length) errors.push('a time offered as a wrong choice for ' + strays[0]);

// ---- a telephone, and no English voice ----
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
phone.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await phone.goto(SITE + '/index.html');
await phone.evaluate(() => localStorage.clear());
await phone.reload();
await phone.waitForTimeout(500);
await phone.evaluate(() => {
  window.speechSynthesis.getVoices = () => [{ name: 'UK', lang: 'en-GB' }];
  window.speechSynthesis.speak = () => {};
  window.speechSynthesis.cancel = () => {};
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  pickVoice();
  startAs(PROFILES.create('Léa', '6eme').id);
});
await phone.waitForTimeout(300);
await phone.evaluate(() => {
  startRound('time');
  const word = state.round[0].word;
  state.round = [{ word, prompt: '', mode: 'clock' }];
  state.index = 0;
  renderShell();
  showQuestion();
});
await phone.waitForTimeout(300);
const pad = await phone.evaluate(() => ({
  look: document.getElementById('keypad').className,
  keys: Array.from(document.querySelectorAll('#keypad .pad-key')).map(k => k.textContent || k.getAttribute('aria-label')),
  wide: document.documentElement.scrollWidth
}));
console.log('the time keyboard:', JSON.stringify(pad));
if (pad.keys.indexOf('am') === -1 || pad.keys.indexOf('pm') === -1 || pad.keys.indexOf(':') === -1) {
  errors.push('the time keyboard lacks am, pm or the colon');
}
if (pad.wide > 390) errors.push('the page scrolls sideways');
for (const k of ['9', ':', '3', '0', ' am']) await phone.tap('#keypad [data-key="' + k + '"]');
const tapped = await phone.evaluate(() => document.getElementById('typed').value);
console.log('tapped out:', JSON.stringify(tapped));
if (tapped !== '9:30 am') errors.push('the keys do not write a time: ' + tapped);
await phone.screenshot({ path: SHOTS + 'v58-keypad.png', fullPage: true });

const silent = await phone.evaluate(() => {
  window.speechSynthesis.getVoices = () => [{ name: 'Amélie', lang: 'fr-FR' }];
  pickVoice();
  const seen = {};
  for (let i = 0; i < 10; i++) {
    startRound('time');
    state.round.forEach(q => { seen[q.mode] = (seen[q.mode] || 0) + 1; });
  }
  return seen;
});
console.log('with no English voice:', JSON.stringify(silent));
if (silent.clock) errors.push('a time is read out on a telephone that cannot read it');

await browser.close();
if (errors.length) {
  console.log('BROKEN');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('no errors');
