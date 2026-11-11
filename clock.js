/* =====================================================================
   CLOCK — telling the time in English, the way the notebook writes it.

   A time is written in figures with am or pm: "8:30 am", "2 pm". The
   French side is the 24-hour clock of a French timetable: "14 h". What
   the pupil has to learn is the step between the two — 14 h is in the
   afternoon, so pm, and 14 − 12 = 2.

   The words themselves live in words.js, in the list marked `clock`.
   This file knows how to read them, and from them works out:
     - the wrong choices of a question, chosen to be the usual mistakes
       rather than any other time: am for pm, 4 pm for 14 h, 9:13 for
       9:30;
     - the explanation shown after a mistake;
     - the sentences of a timetable ("We have history at 9:30 am");
     - whether a typed answer says the right time, however it is typed.
   ===================================================================== */
const CLOCK = (function () {

  // Minutes that sound alike in English: thirty and thirteen, and so on.
  const SOUNDS_LIKE = { 30: 13, 13: 30, 40: 14, 14: 40, 50: 15, 15: 50 };

  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // "14 h", "9 h 30" → { h24: 14, min: 0 }
  function fromFrench(text) {
    const found = String(text).match(/(\d{1,2})\s*h\s*(\d{2})?/i);
    if (!found) return null;
    return { h24: Number(found[1]), min: Number(found[2] || 0) };
  }

  /* What someone typed, or what words.js says: "9:30 am", "9.30am",
     "9h30 a.m.", "2 pm", "2:00 PM". The half of the day is null when
     it was left out, so that the pupil can be told so. */
  function read(text) {
    const s = String(text).toLowerCase()
      .replace(/\s+/g, "")
      .replace(/a\.?m\.?$/, "am")
      .replace(/p\.?m\.?$/, "pm")
      .replace(/[h.]/, ":");
    const found = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
    if (!found) return null;
    const h12 = Number(found[1]);
    const min = Number(found[2] || 0);
    if (h12 < 1 || h12 > 12 || min > 59) return null;
    return { h12, min, half: found[3] || null };
  }

  function to12(h24) {
    return { h12: h24 % 12 === 0 ? 12 : h24 % 12, half: h24 < 12 ? "am" : "pm" };
  }

  // { h12: 9, min: 30, half: "am" } → "9:30 am"; on the hour, "2 pm".
  function write(time) {
    return time.h12 + (time.min ? ":" + String(time.min).padStart(2, "0") : "") +
      " " + time.half;
  }

  function same(a, b) {
    return !!a && !!b && a.h12 === b.h12 && a.min === b.min && a.half === b.half;
  }

  function timeOf(word) { return read(word.en[0]); }

  /* Three wrong times, in the order they are most worth offering: the
     other half of the day, the minute that sounds the same, and the
     hour of someone who took ten rather than twelve off (14 h → 4 pm).
     An hour either side fills in where one of those does not apply. */
  function traps(word) {
    const right = timeOf(word);
    const french = fromFrench(word.fr);
    const other = right.half === "am" ? "pm" : "am";
    const near = right.h12 > 1 ? right.h12 - 1 : right.h12 + 1;
    const found = [Object.assign({}, right, { half: other })];
    if (SOUNDS_LIKE[right.min]) found.push(Object.assign({}, right, { min: SOUNDS_LIKE[right.min] }));
    if (french && french.h24 > 12 && french.h24 - 10 !== right.h12) {
      found.push(Object.assign({}, right, { h12: french.h24 - 10 }));
    }
    found.push(Object.assign({}, right, { h12: near }));
    found.push(Object.assign({}, right, { h12: near, half: other }));
    const seen = new Set([write(right)]);
    return found.map(write).filter(one => !seen.has(one) && seen.add(one)).slice(0, 3);
  }

  /* Why it is am or pm, from the French: what a pupil who got it wrong
     needs to see to get it right next time. */
  function how(word) {
    const french = fromFrench(word.fr);
    const right = timeOf(word);
    if (!french || !right) return "";
    if (french.h24 === 0) return word.fr + ", c'est minuit : on dit 12 am.";
    if (french.h24 < 12) return word.fr + ", c'est le matin : am.";
    if (french.h24 === 12) return word.fr + ", c'est après midi : pm, et l'heure reste 12.";
    return word.fr + ", c'est l'après-midi : pm, et " + french.h24 + " − 12 = " + right.h12 + ".";
  }

  // The time read out loud: "a.m." is said as two letters, "am" might not be.
  function aloud(text) {
    return String(text).replace(/(\d)\s*(a|p)m\b\.?/gi,
      (all, digit, half) => digit + " " + half.toUpperCase() + ".M.");
  }

  // ---- The question "14 h", answered out of four ----
  function choice(word) {
    const answer = word.en[0];
    return { word, prompt: word.fr, answer, options: shuffle([answer].concat(traps(word))) };
  }

  // ---- The timetable sentence, answered out of four ----
  function sentence(word) {
    const french = fromFrench(word.fr);
    const fits = (word.sentences || []).filter(one =>
      !french || ((one.from == null || french.h24 >= one.from) &&
                  (one.to == null || french.h24 <= one.to)));
    const [doing, other] = shuffle(fits);
    const english = (one, time) => one.en + " at " + time + ".";
    const answer = english(doing, word.en[0]);
    const wrong = traps(word);
    const options = [answer, english(doing, wrong[0]), english(doing, wrong[1])];
    // The right time with the wrong subject: reading the whole sentence counts.
    if (other) options.push(english(other, word.en[0]));
    else options.push(english(doing, wrong[2]));
    const said = doing.fr + " à " + word.fr;
    return { word, prompt: said + ".", said, answer, options: shuffle(options) };
  }

  /* Whether a typed answer is the time asked: right hour, right
     minutes, and am or pm. "2:00 pm" is "2 pm"; "14:00" is not an
     answer here, since am and pm are the lesson. */
  function matches(word, attempt) {
    return same(read(attempt), timeOf(word));
  }

  // What to say about a wrong typed answer, beyond the right one.
  function hint(word, attempt) {
    const typed = read(attempt);
    const right = timeOf(word);
    if (!typed) return "Écris l'heure comme dans le cahier : 9:30 am.";
    if (!typed.half) return "N'oublie pas am ou pm.";
    if (typed.h12 === right.h12 && typed.min === right.min) return "Attention à am et pm.";
    if (typed.h12 === right.h12 && SOUNDS_LIKE[right.min] === typed.min) {
      return "Écoute bien les minutes : thirty (30) n'est pas thirteen (13), forty (40) n'est pas fourteen (14).";
    }
    return "";
  }

  return { read, write, to12, fromFrench, traps, how, aloud, choice, sentence, matches, hint };
})();
