/*
  The rules a deck must meet before the store accepts it. The game applies the same rules again to
  whatever it fetches (sanitizeDeck in index.html), so a bad deck can't get in through either door.
  Text is stored as typed and always escaped when shown; nothing here is HTML.

  A deck is { start, injects: [ ... ] }. Each inject: id, cat, title, type, shape (not for a crisis
  inject), crisis (optional), scene, atk {where what when goal}, op, comms, prec, src, ai {task prompt},
  sponsor (optional) {name full url logo}.

  Limits are about twice the longest text in the built-in deck (scene 168, op 123, comms 182,
  prec 300, src 51, prompt 344), so real edits fit but a paste of a whole document doesn't.
*/
import META from "./meta.json";

export const LIMITS = { title: 120, scene: 400, where: 300, what: 300, when: 300, goal: 300, op: 400, comms: 500, prec: 700, src: 120, task: 400, prompt: 800, sname: 40, sfull: 120, url: 300 };
export const MAX_INJECTS = 99;   // the two-screen code carries the inject number as two digits, e.g. R2-07-C4
export const MIN_INJECTS = 4;    // the shortest game is 4 rounds

const ID_RE = /^i[0-9]{2,4}$/;
const isStr = (v) => typeof v === "string";
const httpsUrl = (v) => { try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch (e) { return false; } };

export function validateInject(c, where = "Inject") {
  const errs = [];
  const bad = (m) => errs.push(where + ": " + m);
  if (!c || typeof c !== "object" || Array.isArray(c)) return [where + ": not an inject"];
  if (!isStr(c.id) || !ID_RE.test(c.id)) bad("it has no valid id");
  if (!isStr(c.cat) || !META.cats[c.cat]) bad("choose a category (" + Object.keys(META.cats).join(", ") + ")");
  if (!isStr(c.type) || !META.types[c.type]) bad("choose a type (" + Object.keys(META.types).join(", ") + ")");
  const need = (v, key, label, max, opt) => {
    if (!isStr(v)) { bad(label + " is missing"); return; }
    if (!opt && !v.trim()) bad(label + " can't be empty");
    if (v.length > max) bad(label + " is " + v.length + " characters; the most is " + max);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) bad(label + " has a control character; retype it");
  };
  need(c.title, "title", "the title", LIMITS.title);
  need(c.scene, "scene", "the scene", LIMITS.scene);
  const a = c.atk && typeof c.atk === "object" ? c.atk : {};
  need(a.where, "where", "the attack question 'where'", LIMITS.where);
  need(a.what, "what", "the attack question 'what'", LIMITS.what);
  need(a.when, "when", "the attack question 'when'", LIMITS.when);
  need(a.goal, "goal", "the attack question 'goal'", LIMITS.goal);
  need(c.op, "op", "the operations line", LIMITS.op);
  need(c.comms, "comms", "the communications line", LIMITS.comms);
  need(c.prec, "prec", "the precedent", LIMITS.prec);
  need(c.src, "src", "the precedent's source", LIMITS.src, true);
  const ai = c.ai && typeof c.ai === "object" ? c.ai : {};
  need(ai.task, "task", "the AI assignment", LIMITS.task);
  need(ai.prompt, "prompt", "the AI prompt", LIMITS.prompt);
  if (c.crisis !== undefined && c.crisis !== true) bad("'crisis' is either on or left out");
  if (c.crisis) { if (c.shape !== undefined && c.shape !== null && c.shape !== "") bad("a crisis inject hits the whole jurisdiction, so it has no footprint shape"); }
  else if (!isStr(c.shape) || !META.shapes[c.shape]) bad("choose a footprint shape");
  if (c.sponsor !== undefined) {
    const s = c.sponsor;
    if (!s || typeof s !== "object") bad("the sponsor is malformed");
    else {
      need(s.name, "name", "the sponsor's short name", LIMITS.sname);
      need(s.full, "full", "the sponsor's full name", LIMITS.sfull);
      if (!isStr(s.url) || !httpsUrl(s.url) || s.url.length > LIMITS.url) bad("the sponsor's link must be a web address starting with https://");
      if (!isStr(s.logo) || !httpsUrl(s.logo) || s.logo.length > LIMITS.url) bad("the sponsor's logo must be a web address starting with https://");
    }
  }
  const known = new Set(["id", "cat", "title", "type", "shape", "crisis", "scene", "atk", "op", "comms", "prec", "src", "ai", "sponsor"]);
  for (const k of Object.keys(c)) if (!known.has(k)) bad("unexpected field '" + k + "'");
  return errs;
}

export function validateDeck(d) {
  const errs = [];
  if (!d || typeof d !== "object" || !Array.isArray(d.injects)) return ["The deck is malformed."];
  const n = d.injects.length;
  if (n < MIN_INJECTS) errs.push("A deck needs at least " + MIN_INJECTS + " injects; this one has " + n + ".");
  if (n > MAX_INJECTS) errs.push("A deck holds at most " + MAX_INJECTS + " injects; this one has " + n + ".");
  if (!Number.isInteger(d.start) || d.start < 1 || d.start > Math.max(n, 1)) errs.push("The starting inject must be a position from 1 to " + n + ".");
  const ids = new Set();
  d.injects.forEach((c, i) => {
    const label = "Inject " + (i + 1) + (c && isStr(c.title) && c.title ? " (" + c.title.slice(0, 40) + ")" : "");
    errs.push(...validateInject(c, label));
    if (c && isStr(c.id)) { if (ids.has(c.id)) errs.push(label + ": the id " + c.id + " is used twice"); ids.add(c.id); }
  });
  if (JSON.stringify(d).length > 400000) errs.push("The deck is too large.");
  return errs;
}
