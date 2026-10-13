/*
  The rules a deck must meet before the store accepts it. The game applies the same rules again to
  whatever it fetches (sanitizeDeck in index.html), so a bad deck can't get in through either door.
  Text is stored as typed and always escaped when shown; nothing here is HTML.

  A deck is { injects: [ ... ] }; the first inject starts the game (build 14: there used to be a start position, 6). Each inject: id, cat, title, type, shape (not for a crisis
  inject), crisis (optional), scene, atk {where what when goal}, op, comms, prec, src, ai {task prompt} (optional, from build 17),
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
  // Build 17: the AI assignment is optional (a game can run without it), so an inject may have no AI task or prompt;
  // if given they still have to fit.
  const ai = c.ai && typeof c.ai === "object" ? c.ai : {};
  need(ai.task === undefined ? "" : ai.task, "task", "the AI assignment", LIMITS.task, true);
  need(ai.prompt === undefined ? "" : ai.prompt, "prompt", "the AI prompt", LIMITS.prompt, true);
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
  const ids = new Set();
  d.injects.forEach((c, i) => {
    const label = "Inject " + (i + 1) + (c && isStr(c.title) && c.title ? " (" + c.title.slice(0, 40) + ")" : "");
    errs.push(...validateInject(c, label));
    if (c && isStr(c.id)) { if (ids.has(c.id)) errs.push(label + ": the id " + c.id + " is used twice"); ids.add(c.id); }
  });
  if (JSON.stringify(d).length > 400000) errs.push("The deck is too large.");
  return errs;
}

/*
  Build 24: reading a backup file before a restore. The suite's backup standard asks every tool to let its editors keep
  their own copy of their data and put it back, and to check the whole file before anything changes, so a wrong, damaged
  or newer-format file changes nothing and says what to do. Before this build the only way back was the server's own
  History (500 versions), which is lost with the store; a file on someone's own disk is not.

  A backup is { app, schemaVersion, appVersion, savedAt, savedBy, deckVersion, deckSavedAt, injects }. Only the injects
  are ever restored: every other field is a label for the confirm dialog, so a file carrying anything else (a sessions
  or tokens list, a "version" of its own) can't put it into the store.

  Older files restore: a file with no "app" and no "schemaVersion" but an injects list is read as format 0, which is
  what the public deck address (/api/deck) returns and what anyone could have saved before backups existed. Fields an
  older inject lacks get the same defaults the editor gives a new inject (no precedent source: empty; no AI
  assignment: none), and the pre-build-14 starting position is ignored, as it is everywhere else.
*/
export const BACKUP_APP = "ballotship-injects";
// Written into every backup file as appVersion, so a file says which build made it. Kept here, not in index.js, because a
// Worker's main module may export only handlers and Durable Object classes. Must match the newest build in the log at the
// top of index.html (tests/build-number.test.js checks).
export const APP_BUILD = 24;
export const BACKUP_SCHEMA = 1;

export function readBackup(f) {
  const fail = (m) => ({ errors: [m] });
  const OTHER = "Choose a file whose name starts with ballotship-injects-backup.";
  if (!f || typeof f !== "object" || Array.isArray(f)) return fail("This isn't a backup of the inject library. Nothing was changed. " + OTHER);
  if (f.app !== undefined && f.app !== BACKUP_APP) {
    const what = isStr(f.app) ? " (it says " + f.app.replace(/[\u0000-\u001f]/g, " ").slice(0, 60) + ")" : "";
    return fail("This is a backup from a different tool" + what + ", not the Ballotship inject library. Nothing was changed. " + OTHER);
  }
  let schema = 0;
  if (f.schemaVersion !== undefined) {
    if (!Number.isInteger(f.schemaVersion) || f.schemaVersion < 0) return fail("This backup file is damaged (its format number is unreadable). Nothing was changed. Use another backup.");
    schema = f.schemaVersion;
  } else if (f.app === BACKUP_APP) return fail("This backup file is damaged (its format number is missing). Nothing was changed. Use another backup.");
  if (schema > BACKUP_SCHEMA) return fail("This backup was made by a newer version of the inject library (file format " + schema + "; this one reads up to " + BACKUP_SCHEMA + "). Nothing was changed. Use a backup made by this version, or ask for the library to be updated first.");
  if (!Array.isArray(f.injects)) return fail("This file has no injects in it, so it may be damaged or not a backup of the inject library. Nothing was changed. " + OTHER);
  const injects = f.injects.map((c) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return c;
    const x = { ...c };   // not Object.assign: that would turn an own "__proto__" key into the object's prototype, hiding it from the checks
    if (x.src === undefined) x.src = "";   // safe default for an older inject; anything else missing is reported by validateDeck
    return x;
  });
  const deck = { injects };
  const errors = validateDeck(deck);
  if (errors.length) return { errors: errors.map((e, i) => i === 0 ? "This backup can't be restored, so nothing was changed. " + e : e) };
  const iso = (v) => { if (!isStr(v)) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
  const text = (v, n) => isStr(v) ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) || null : null;
  return {
    errors: [],
    deck,
    info: {
      schemaVersion: schema,
      savedAt: iso(f.savedAt), savedBy: text(f.savedBy, 254), appVersion: text(f.appVersion, 40),
      deckVersion: Number.isInteger(f.deckVersion) ? f.deckVersion : Number.isInteger(f.version) ? f.version : null,
      count: injects.length, crisis: injects.filter((c) => c.crisis).length, sponsored: injects.filter((c) => c.sponsor).length,
    },
  };
}
