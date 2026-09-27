/* The keyboard the page brings to a telephone.

   A phone's own keyboard offers the word being typed: "to" and there is
   "tomorrow" above the keys, and the dictation is given away. So where
   the answer is typed with a finger, the page shows a keyboard of its
   own and keeps the phone's shut: letters for the dictation, figures for
   the CE2's sums and numbers. It carries the only Valider button.

   A computer keeps its real keyboard, which guesses nothing, and the
   box keeps its button beside it.

   While a question is asked it has the page to itself: no name, no card,
   only the way out, and the keyboard as wide as the screen at its foot. */
import { chromium } from 'playwright';
/* Where to find the browser, the pages and somewhere to drop the
   screenshots. The defaults are the ones tests/run.mjs sets up; every
   one of them can be pointed elsewhere from the environment. */
const BROWSER = process.env.CHROMIUM || undefined;   // undefined: the one Playwright brought
const SITE = process.env.SITE || 'http://localhost:8123';
const SHOTS = process.env.SHOTS || new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: BROWSER });
const errors = [];

const open = async (options) => {
  const page = await browser.newPage(options);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' && !/CERT|favicon|fonts\.g|404/.test(text)) errors.push('CONSOLE ' + text);
  });
  await page.goto(SITE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  return page;
};

// What the answer area holds: the box, the keyboard, and every button that sends.
const look = page => page.evaluate(() => {
  const input = document.getElementById('typed');
  const pad = document.getElementById('keypad');
  const check = document.getElementById('check');
  return {
    inputmode: input.getAttribute('inputmode'),
    keypad: pad ? pad.className : null,
    keys: pad ? pad.querySelectorAll('.pad-key').length : 0,
    submits: document.querySelectorAll('#body button[type="submit"]').length,
    checkInKeypad: !!(pad && pad.contains(check)),
    checkSends: check.form ? check.form.id : null,
    wide: document.documentElement.scrollWidth
  };
});

// Types an answer the way a finger would, one key after another.
const tapOut = async (page, text) => {
  for (const c of text) await page.tap('#keypad [data-key="' + c + '"]');
};

// ---- a computer: no keyboard of the page's, the button beside the box ----
const desk = await open({ viewport: { width: 900, height: 900 } });
await desk.evaluate(() => startAs(PROFILES.create('Léo', '6eme').id));
await desk.waitForTimeout(300);
await desk.evaluate(() => { state.mode = 'spell'; renderMenu(); });
await desk.click('[data-lesson="*"]');
await desk.waitForTimeout(300);
const onDesk = await look(desk);
console.log('dictation on a computer:', JSON.stringify(onDesk));
if (onDesk.keypad) errors.push('a computer is shown the on-screen keyboard');
if (onDesk.submits !== 1 || onDesk.checkSends !== 'spellForm') errors.push('the computer lost its Valider button');
await desk.close();

// ---- a telephone: the dictation ----
const phone = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
console.log('a finger for a pointer:', await phone.evaluate(() => matchMedia('(pointer: coarse)').matches));
await phone.evaluate(() => startAs(PROFILES.create('Léa', '6eme').id));
await phone.waitForTimeout(300);
await phone.evaluate(() => { state.mode = 'spell'; renderMenu(); });
await phone.click('[data-lesson="*"]');
await phone.waitForTimeout(300);

const letters = await look(phone);
console.log('dictation on a phone:', JSON.stringify(letters));
if (letters.inputmode !== 'none') errors.push('the phone keyboard still opens: inputmode ' + letters.inputmode);
if (!/letters/.test(letters.keypad || '')) errors.push('no letter keyboard on a phone');
// 26 letters, the apostrophe, the hyphen, space, delete and Valider.
if (letters.keys !== 31) errors.push('the letter keyboard has ' + letters.keys + ' keys');
if (letters.submits !== 1) errors.push(letters.submits + ' Valider buttons on a phone');
if (!letters.checkInKeypad || letters.checkSends !== 'spellForm') errors.push('Valider is not the keyboard\'s, or sends nothing');
if (letters.wide > 390) errors.push('the keyboard pushes the page sideways: ' + letters.wide + 'px');
await phone.screenshot({ path: SHOTS + 'v57-letters.png', fullPage: true });

// The right word, typed key by key, is right.
const word = await phone.evaluate(() => state.round[state.index].word.en[0].toLowerCase());
await tapOut(phone, word);
const typed = await phone.evaluate(() => document.getElementById('typed').value);
console.log('tapped out:', JSON.stringify(word), '->', JSON.stringify(typed));
if (typed !== word) errors.push('the keys wrote ' + typed + ' for ' + word);
await phone.tap('#check');
await phone.waitForTimeout(300);
const rightVerdict = await phone.evaluate(() => document.getElementById('verdict').textContent);
console.log('verdict:', rightVerdict.slice(0, 60));
if (!/Sans faute/.test(rightVerdict)) errors.push('a word typed on the keys was not taken: ' + rightVerdict);
// Once answered the keys write nothing more.
await phone.tap('#keypad [data-key="a"]');
if (await phone.evaluate(() => document.getElementById('typed').value) !== word) {
  errors.push('the keys still write in an answered box');
}
await phone.waitForTimeout(1600);

// A key writes where the caret is, and delete takes the letter before it.
const caret = await phone.evaluate(() => {
  const input = document.getElementById('typed');
  input.value = 'tmorrow';
  input.focus();
  input.setSelectionRange(1, 1);
  return true;
});
await phone.tap('#keypad [data-key="o"]');
await phone.tap('#keypad [data-key="o"]');
await phone.tap('#keypad [data-key="back"]');
const edited = await phone.evaluate(() => ({
  value: document.getElementById('typed').value,
  focused: document.activeElement.id
}));
console.log('writing at the caret:', JSON.stringify(edited));
if (!caret || edited.value !== 'tomorrow') errors.push('the keys did not write at the caret: ' + edited.value);
if (edited.focused !== 'typed') errors.push('a key took the focus from the box: ' + edited.focused);

// A wrong word is copied out on the same keys, and Valider says Recopier.
await phone.evaluate(() => { document.getElementById('typed').value = ''; });
await tapOut(phone, 'zz');
await phone.tap('#check');
await phone.waitForTimeout(300);
const copy = await phone.evaluate(() => ({
  says: document.getElementById('check').textContent,
  placeholder: document.getElementById('typed').placeholder
}));
console.log('after a wrong word:', JSON.stringify(copy));
if (copy.says !== 'Recopier') errors.push('the keyboard\'s button does not ask to copy out');
const answer = await phone.evaluate(() => state.round[state.index].word.en[0].toLowerCase());
await tapOut(phone, answer);
await phone.tap('#check');
await phone.waitForTimeout(300);
const copied = await phone.evaluate(() => document.getElementById('typed').disabled);
console.log('copied out:', copied);
if (!copied) errors.push('copying the word out on the keys did not let the pupil on');

// ---- a telephone: the CE2's sums ----
await phone.evaluate(() => startAs(PROFILES.create('Camille', 'ce2').id));
await phone.waitForTimeout(300);
await phone.click('[data-lesson="doubles"]');
await phone.waitForTimeout(300);
const digits = await look(phone);
console.log('a sum on a phone:', JSON.stringify(digits));
if (!/digits/.test(digits.keypad || '')) errors.push('no keypad of figures for a sum');
// Ten figures, delete and Valider: nothing else.
if (digits.keys !== 12) errors.push('the keypad of figures has ' + digits.keys + ' keys');
if (digits.submits !== 1 || digits.checkSends !== 'sumForm') errors.push('a sum does not have one Valider');
if (digits.inputmode !== 'none') errors.push('the phone keypad still opens for a sum');
await phone.screenshot({ path: SHOTS + 'v57-digits.png', fullPage: true });
const sum = await phone.evaluate(() => String(state.round[state.index].word.answer));
await tapOut(phone, sum);
await phone.tap('#check');
await phone.waitForTimeout(300);
const sumVerdict = await phone.evaluate(() => document.getElementById('verdict').textContent);
console.log('the sum:', sum, '->', sumVerdict.slice(0, 40));
if (!/C'est juste/.test(sumVerdict)) errors.push('a sum typed on the keys was not taken');

// ---- a telephone: an English number heard, written in figures ----
await phone.evaluate(() => {
  startRound('numbers_ce2');
  const first = state.round.find(q => q.mode === 'count') || state.round[0];
  first.mode = 'count';
  state.round = [first];
  state.index = 0;
  renderShell();
  showQuestion();
});
await phone.waitForTimeout(300);
const heard = await look(phone);
console.log('a number heard on a phone:', JSON.stringify(heard));
if (!/digits/.test(heard.keypad || '') || heard.submits !== 1 || heard.checkSends !== 'countForm') {
  errors.push('the number heard is not answered on the keypad of figures');
}

// ---- an exercise takes the whole page ----
/* Nothing but the question and the way out: no name, no card around it,
   and the keyboard as wide as the screen, down under the thumbs. */
await phone.evaluate(() => startAs(PROFILES.create('Léa', '6eme').id));
await phone.waitForTimeout(300);
await phone.evaluate(() => { state.mode = 'spell'; renderMenu(); });
await phone.click('[data-lesson="*"]');
await phone.waitForTimeout(300);
const page = () => phone.evaluate(() => {
  const card = document.querySelector('#screen > .card');
  const pad = document.getElementById('keypad');
  const box = pad && pad.getBoundingClientRect();
  return {
    inRound: document.body.classList.contains('in-round'),
    name: getComputedStyle(document.getElementById('heading')).display !== 'none',
    wayOut: document.getElementById('wayout').hidden ? null : document.getElementById('wayout').textContent,
    cardEdge: card ? getComputedStyle(card).borderLeftWidth : null,
    grid: getComputedStyle(document.body).backgroundImage,
    pad: box ? { left: Math.round(box.left), right: Math.round(innerWidth - box.right),
                 bottom: Math.round(innerHeight - box.bottom) } : null,
    wide: document.documentElement.scrollWidth
  };
});
const whole = await page();
console.log('an exercise on a phone:', JSON.stringify(whole));
if (!whole.inRound || whole.name) errors.push('the name is still shown during an exercise');
if (whole.wayOut !== 'Changer de liste') errors.push('the way out is gone: ' + whole.wayOut);
if (whole.cardEdge !== '0px') errors.push('the question is still framed: ' + whole.cardEdge);
if (whole.grid !== 'none') errors.push('the grid still shows behind the exercise');
if (!whole.pad || whole.pad.left > 4 || whole.pad.right > 4) errors.push('the keyboard is not as wide as the screen');
if (!whole.pad || whole.pad.bottom > 20) errors.push('the keyboard is not at the bottom of the screen');
if (whole.wide > 390) errors.push('the page scrolls sideways: ' + whole.wide + 'px');
await phone.screenshot({ path: SHOTS + 'v57-whole-page.png' });

// The multiple choice keeps its small numbers beside each word.
await phone.evaluate(() => { state.mode = 'mcq'; renderMenu(); });
await phone.click('[data-lesson="*"]');
await phone.waitForTimeout(300);
const number = await phone.evaluate(() => {
  const one = document.querySelector('.option .key');
  return { border: getComputedStyle(one).borderLeftWidth, height: one.getBoundingClientRect().height };
});
console.log('a choice\'s number:', JSON.stringify(number));
if (number.border !== '0px' || number.height > 30) errors.push('a choice\'s number looks like a key');

// Leaving the exercise gives the page its name back.
await phone.click('#wayout');
await phone.waitForTimeout(300);
const menu = await page();
console.log('back on the menu:', JSON.stringify({ inRound: menu.inRound, name: menu.name }));
if (menu.inRound || !menu.name) errors.push('the menu did not get its name back');

console.log(errors.length ? 'BROKEN\n' + errors.join('\n') : 'no errors');
await browser.close();
