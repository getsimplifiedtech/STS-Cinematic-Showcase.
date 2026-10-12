// The audit ledger (G6-3A proof of concept): one append-only JSON-lines file per client.
//   entry = { seq, prev, ts, client, type, actor: { id, role }, data, hash, receipt }
//   hash = SHA-256 of the canonical body; prev = the previous hash (a chain); receipt = HMAC of the hash with the RC runner's key.
// A line that was edited, removed, reordered, or ADDED by anyone without the runner key fails verification. The head file (seq, hash, receipt) also makes a truncated
// tail visible. This models, locally, what the real design asks of RC: a line counts only if an RC workflow run produced it (the run, not the text, is the authority).
// Limit (documented): someone who can write BOTH the ledger and the head file and also holds the runner key can rewrite history; in the real design that is "someone who
// can edit the release-control repository", who is the owner alone.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RcError, canonicalJson, hmac, inside, sameHex, sha256, writeAtomic } from './util.mjs';
import { parseStrictJson } from '../../lib/strict-json.mjs';

export class Ledger {
  constructor(rc, client) {
    this.rc = rc; this.client = client;
    this.file = inside(rc.dir, 'ledger', `${client}.jsonl`);
    this.headFile = inside(rc.dir, 'ledger', `${client}.head.json`);
    this.lockDir = inside(rc.dir, 'ledger', `${client}.lock`);
    this.anchorFile = inside(rc.dir, 'anchor', `${client}.json`);   // a second copy of the head, kept outside the ledger folder
  }
  // One operation at a time per client (the real workflows use a concurrency group per client). The lock records who holds it; a lock whose holder is gone, or that is
  // older than ten minutes, is broken; an URGENT operation (freeze, revoke) breaks a lock older than thirty seconds, so the emergency controls cannot be starved.
  withLock(fn, { urgent = false } = {}) {
    const info = join(this.lockDir, 'info.json');
    const take = () => { mkdirSync(this.lockDir); writeFileSync(info, JSON.stringify({ pid: process.pid, ts: Date.now() })); };
    try { take(); } catch {
      let held = null; try { held = JSON.parse(readFileSync(info, 'utf8')); } catch { /* no usable info: treat as stale */ }
      const age = held ? Date.now() - held.ts : Infinity;
      let alive = false; if (held) { try { process.kill(held.pid, 0); alive = true; } catch { alive = false; } }
      if (!alive || age > 600000 || (urgent && age > 30000)) { rmSync(this.lockDir, { recursive: true, force: true }); take(); }
      else throw new RcError('busy', `another operation on ${this.client} is in progress`);
    }
    try { return fn(); } finally { rmSync(this.lockDir, { recursive: true, force: true }); }
  }
  entries() {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((l) => parseStrictJson(l));
  }
  // returns { ok, problems, entries, headBehind }; never throws on bad content
  verify() {
    const problems = [];
    let entries = [];
    try {
      if (existsSync(this.file)) {
        const text = readFileSync(this.file, 'utf8');
        if (text && !text.endsWith('\n')) problems.push('the ledger does not end with a newline (a partial or hand-edited line)');
        entries = text.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((l, i) => {
          try { const v = parseStrictJson(l); if (!v || typeof v !== 'object' || Array.isArray(v)) { problems.push(`line ${i + 1} is not an entry`); return null; } return v; }
          catch (e) { problems.push(`line ${i + 1} is not valid JSON (${String(e.message).slice(0, 50)})`); return null; }
        });
      } else if (this.rc.config.clients[this.client]) problems.push('the ledger file is missing (a registered client always has one: it starts with a genesis entry)');
    } catch (e) { problems.push(`the ledger cannot be read (${e.message})`); }
    let prev = 'GENESIS';
    entries.forEach((e, i) => {
      if (!e) return;
      const where = `entry ${i + 1}`;
      if (e.seq !== i + 1) problems.push(`${where}: sequence ${e.seq}, expected ${i + 1}`);
      if (e.client !== this.client) problems.push(`${where}: belongs to client ${e.client}`);
      if (e.prev !== prev) problems.push(`${where}: does not follow the previous entry (the chain is broken or an entry was removed)`);
      const { hash, receipt, ...body } = e;
      const h = sha256(canonicalJson(body));
      if (h !== hash) problems.push(`${where}: the content does not match its hash (edited)`);
      if (typeof receipt !== 'string' || !sameHex(receipt, hmac(this.rc.runnerKey, String(hash)))) problems.push(`${where}: no valid runner receipt (not written by the release-control runner)`);
      prev = hash;
    });
    const good = entries.filter(Boolean), last = good.at(-1) || null;
    let headBehind = false;
    const check = (label, file, key) => {
      let h = null;
      try { h = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { problems.push(`the ${label} is not valid JSON`); return; }
      if (!h) { if (last) problems.push(`the ${label} is missing (the tail cannot be checked)`); return; }
      if (!sameHex(h.receipt || '', hmac(this.rc.runnerKey, `${h.seq}:${h.hash}`))) { problems.push(`the ${label} has no valid runner receipt`); return; }
      const at = good.find((e) => e.seq === h.seq);
      if (last && h.seq === last.seq - 1 && last.prev === h.hash && at && at.hash === h.hash) { headBehind = true; return; }   // a crash between writing the entry and the head: healed by the next write
      if (!last || h.seq !== last.seq || h.hash !== last.hash) problems.push(`the ledger ends at entry ${last ? last.seq : 0} but the ${label} says ${h.seq} (entries were truncated, or an older ledger was put back)`);
      void key;
    };
    check('head file', this.headFile, 'head'); check('anchor', this.anchorFile, 'anchor');
    return { ok: problems.length === 0, problems, entries: good, headBehind };
  }
  append({ type, actor, data, ts, genesis = false }) {
    // only the initialisation may start a ledger, and only where no ledger, head or anchor exists yet
    if (genesis && (existsSync(this.file) || existsSync(this.headFile) || existsSync(this.anchorFile))) throw new RcError('ledger-exists', `the ledger of ${this.client} already exists`);
    const v = genesis ? { ok: true, entries: [] } : this.verify();
    if (!v.ok) throw new RcError('ledger-corrupt', `the ledger of ${this.client} does not verify: ${v.problems[0]}`);
    const last = v.entries.at(-1);
    const body = { seq: (last?.seq || 0) + 1, prev: last?.hash || 'GENESIS', ts, client: this.client, type, actor: { id: actor.id, role: actor.role }, data };
    const hash = sha256(canonicalJson(body));
    const entry = { ...body, hash, receipt: hmac(this.rc.runnerKey, hash) };
    appendFileSync(this.file, JSON.stringify(entry) + '\n', { mode: 0o600 });
    const head = JSON.stringify({ seq: entry.seq, hash, receipt: hmac(this.rc.runnerKey, `${entry.seq}:${hash}`) }) + '\n';
    writeAtomic(this.headFile, head); mkdirSync(join(this.rc.dir, 'anchor'), { recursive: true }); writeAtomic(this.anchorFile, head);
    return entry;
  }
}
// attempts that were refused are recorded too (a global, unchained list: it can be spammed, which is loud rather than harmful)
export function logDenied(rc, { actor, op, client, code, reason, ts }) {
  const body = { ts, actor: actor || { id: 'unknown', role: 'none' }, op, client: String(client).slice(0, 60), code, reason: String(reason).slice(0, 200) };
  const line = { ...body, receipt: hmac(rc.runnerKey, sha256(canonicalJson(body))) };
  const file = inside(rc.dir, 'ledger', '_denied.jsonl');
  try { if (existsSync(file) && statSync(file).size > 1024 * 1024) renameSync(file, `${file}.1`); } catch { /* best effort */ }   // bounded: the oldest refusals roll off
  appendFileSync(file, JSON.stringify(line) + '\n', { mode: 0o600 });
}
