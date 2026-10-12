// The audit ledger (G6-3A proof of concept): one append-only JSON-lines file per client.
//   entry = { seq, prev, ts, client, type, actor: { id, role }, data, hash, receipt }
//   hash = SHA-256 of the canonical body; prev = the previous hash (a chain); receipt = HMAC of the hash with the RC runner's key.
// A line that was edited, removed, reordered, or ADDED by anyone without the runner key fails verification. The head file (seq, hash, receipt) also makes a truncated
// tail visible. This models, locally, what the real design asks of RC: a line counts only if an RC workflow run produced it (the run, not the text, is the authority).
// Limit (documented): someone who can write BOTH the ledger and the head file and also holds the runner key can rewrite history; in the real design that is "someone who
// can edit the release-control repository", who is the owner alone.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { RcError, canonicalJson, hmac, inside, sameHex, sha256 } from './util.mjs';
import { parseStrictJson } from '../../lib/strict-json.mjs';

export class Ledger {
  constructor(rc, client) {
    this.rc = rc; this.client = client;
    this.file = inside(rc.dir, 'ledger', `${client}.jsonl`);
    this.headFile = inside(rc.dir, 'ledger', `${client}.head.json`);
    this.lockDir = inside(rc.dir, 'ledger', `${client}.lock`);
  }
  // one operation at a time per client (the real workflows use a concurrency group per client)
  withLock(fn) {
    try { mkdirSync(this.lockDir); } catch { throw new RcError('busy', `another operation on ${this.client} is in progress (or a stale lock remains)`); }
    try { return fn(); } finally { rmSync(this.lockDir, { recursive: true, force: true }); }
  }
  entries() {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((l) => parseStrictJson(l));
  }
  // returns { ok, problems, entries }; never throws on bad content
  verify() {
    const problems = [];
    let entries = [];
    try {
      if (existsSync(this.file)) {
        const text = readFileSync(this.file, 'utf8');
        if (text && !text.endsWith('\n')) problems.push('the ledger does not end with a newline (a partial or hand-edited line)');
        entries = text.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((l, i) => { try { return parseStrictJson(l); } catch (e) { problems.push(`line ${i + 1} is not valid JSON (${String(e.message).slice(0, 50)})`); return null; } });
      }
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
    let head = null;
    try { head = existsSync(this.headFile) ? JSON.parse(readFileSync(this.headFile, 'utf8')) : null; } catch { problems.push('the head file is not valid JSON'); }
    const last = entries.filter(Boolean).at(-1) || null;
    if (!head && last) problems.push('the head file is missing (the tail cannot be checked)');
    else if (head) {
      if (!sameHex(head.receipt || '', hmac(this.rc.runnerKey, `${head.seq}:${head.hash}`))) problems.push('the head file has no valid runner receipt');
      else if (!last || head.seq !== last.seq || head.hash !== last.hash) problems.push(`the ledger ends at entry ${last ? last.seq : 0} but the head says ${head.seq} (entries were truncated or the ledger was replaced)`);
    }
    return { ok: problems.length === 0, problems, entries: entries.filter(Boolean) };
  }
  append({ type, actor, data, ts }) {
    const v = this.verify();
    if (!v.ok) throw new RcError('ledger-corrupt', `the ledger of ${this.client} does not verify: ${v.problems[0]}`);
    const last = v.entries.at(-1);
    const body = { seq: (last?.seq || 0) + 1, prev: last?.hash || 'GENESIS', ts, client: this.client, type, actor: { id: actor.id, role: actor.role }, data };
    const hash = sha256(canonicalJson(body));
    const entry = { ...body, hash, receipt: hmac(this.rc.runnerKey, hash) };
    appendFileSync(this.file, JSON.stringify(entry) + '\n', { mode: 0o600 });
    writeFileSync(this.headFile, JSON.stringify({ seq: entry.seq, hash, receipt: hmac(this.rc.runnerKey, `${entry.seq}:${hash}`) }) + '\n', { mode: 0o600 });
    return entry;
  }
}
// attempts that were refused are recorded too (a global, unchained list: it can be spammed, which is loud rather than harmful)
export function logDenied(rc, { actor, op, client, code, reason, ts }) {
  const body = { ts, actor: actor || { id: 'unknown', role: 'none' }, op, client: String(client).slice(0, 60), code, reason: String(reason).slice(0, 200) };
  const line = { ...body, receipt: hmac(rc.runnerKey, sha256(canonicalJson(body))) };
  appendFileSync(inside(rc.dir, 'ledger', '_denied.jsonl'), JSON.stringify(line) + '\n', { mode: 0o600 });
}
