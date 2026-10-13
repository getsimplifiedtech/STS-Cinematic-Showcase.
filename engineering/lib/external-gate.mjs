// The external-link release requirement (G6-3, APR-JE-040; decision D-P5-1, finding RG-02). For a client-production release:
//   1. the destination list is derived from the files the release DELIVERS (not from a registry anyone can edit, and not from build input such as config/);
//      its digest is the unit everything below is bound to
//   2. a verification record (engineering/external-links-verification.json, history) covers exactly that list, comes from a run that had a network
//      (github-actions or person; a sandbox run never counts), is at most `maxAgeDays` old, and shows every clickable destination `verified`
//   3. every clickable destination is https, none is on a reserved, preview or staging host, none went through an http hop
//   4. a person's `external-links-review` record (lib/records.mjs) is in force for this candidate and this list: reachability alone is never the approval
// What this proves: the recorded run covered this list and says so. What it cannot prove: that the run happened, or that a runner called
// `github-actions` was one (a JSON record is not proof of authenticity; see lib/authenticity.mjs and G6-3-SCOPE.md section 5).
import { collectExternal, groupDestinations, recordProblems, registryDigest } from './external.mjs';
import { isReservedHost } from './hosts.mjs';
import { newestFirst } from './supply.mjs';

// the files a release carries: build input (config/) and engineering files are not delivered
const NOT_DELIVERED = /^((config|engineering)\/|START-HERE\.txt$|serve\.py$)/;   // (START-HERE.txt and serve.py are added to the ZIP when it is packed; they are not part of the built site)
// baseUrl: the site's own address (seo.baseUrl). Its own pages, sitemap and canonical links are the site itself, not external destinations: they cannot be reached
// before the site is live, and a parked page answering 200 would "verify" an address that is not this site (G6-3 review, F5). Only other hosts are destinations.
export function deliveredDestinations(siteDir, { baseUrl = null } = {}) {
  let own = null; try { own = baseUrl ? new URL(baseUrl).hostname.toLowerCase() : null; } catch { own = null; }
  const host = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };
  const found = collectExternal(siteDir).filter((f) => !NOT_DELIVERED.test(f.file) && !(own && host(f.url) === own));
  const destinations = groupDestinations(found);
  return { destinations, digest: registryDigest({ destinations }) };
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// ext: { destinations, digest }; history: the parsed external-links-verification.json (or null); review: the resolve() result for external-links-review
// Returns { ok, detail, record }.
function statusOf({ ext, history, today, maxAgeDays = 30 }) {
  if (!ext) return { ok: false, detail: 'the destination list of this build is unknown', record: null };
  const links = ext.destinations.filter((d) => d.kind === 'link');
  const bad = [];
  for (const d of links) {
    let u = null; try { u = new URL(d.url); } catch { /* reported */ }
    if (!u || u.protocol !== 'https:') bad.push(`${d.url} is a clickable link that is not https`);
    else if (isReservedHost(u.hostname)) bad.push(`${d.url} points at a reserved, example, local, preview or staging host`);
  }
  if (bad.length) return { ok: false, detail: bad.slice(0, 3).join('; '), record: null };
  if (!ext.destinations.length) return { ok: true, detail: 'the build delivers no external destination: nothing to verify', record: null, none: true };
  if (!history || !Array.isArray(history.records)) return { ok: false, detail: 'there is no external-links verification history', record: null };
  const covering = history.records.filter((r) => r && r.registryDigest === ext.digest).sort(newestFirst);   // the newest record for this list decides; an older one never rescues it
  if (!covering.length) return { ok: false, detail: `no verification record covers this build's ${ext.destinations.length} destination(s) (digest ${ext.digest.slice(0, 12)}…): run npm run release:external-digest, then verify with --delivered on a networked runner`, record: null };
  const r = covering[0];
  const probs = recordProblems({ file: { records: [r] }, today });
  if (probs.length) return { ok: false, detail: `${r.id} is not a well-formed record: ${probs[0]}`, record: r };
  if (!['github-actions', 'person'].includes(r.runner?.kind)) return { ok: false, detail: `${r.id} was made by a "${r.runner?.kind}" run, which had no network to speak of and never counts`, record: r };
  if (r.date > today) return { ok: false, detail: `${r.id} is dated in the future`, record: r };
  const age = daysBetween(r.date, today);
  if (age > maxAgeDays) return { ok: false, detail: `${r.id} is ${age} days old (limit ${maxAgeDays}): verify again`, record: r };
  const byUrl = new Map(r.results.map((x) => [x.url, x]));
  const missing = ext.destinations.filter((d) => !byUrl.has(d.url));
  if (missing.length) return { ok: false, detail: `${r.id} has no result for ${missing.slice(0, 2).map((d) => d.url).join(', ')}`, record: r };
  const notOk = [];
  for (const d of ext.destinations) {
    const x = byUrl.get(d.url);
    if (d.kind === 'link') { if (x.class !== 'verified') notOk.push({ url: d.url, kind: 'link', text: `${d.url}: ${x.class}` }); else if ((x.chain || []).some((h) => !/^https:/.test(h.url))) notOk.push({ url: d.url, kind: 'link', text: `${d.url}: an http hop` }); }
    else if (x.class !== 'verified') notOk.push({ url: d.url, kind: 'mention', text: `${d.url} (printed in text): ${x.class}` });
  }
  if (notOk.length) return { ok: false, detail: `${r.id}: ${notOk.slice(0, 3).map((n) => n.text).join('; ')}; a person may accept a printed mention by name in the external-links review, never a link`, record: r, notOk };
  return { ok: true, detail: `${r.id} (${r.date}, ${r.runner.kind}) verified all ${ext.destinations.length} destination(s) of this build over https`, record: r };
}

export function externalLinksStatus(args) {
  try { return statusOf(args); } catch (e) { return { ok: false, detail: `the external-links record cannot be read (${String(e.message).slice(0, 80)})`, record: null }; }
}

// The mentions a reviewer accepted although they were not verified: [{ url, reason }] from the in-force review's subject.
export function acceptedMentions(review, recordId) {
  const out = new Map();
  for (const m of (review?.approved || []).filter((x) => x.r.subject.verification === recordId)) for (const a of m.r.subject.accepted || []) out.set(a.url, a.reason);
  return out;
}

// Combine: a printed mention that is not `verified` may be accepted by the review; a clickable link never.
export function externalLinksGate({ ext, history, today, maxAgeDays, review }) {
  const s = externalLinksStatus({ ext, history, today, maxAgeDays });
  if (s.ok || !s.notOk) return s;
  const acc = acceptedMentions(review, s.record.id);
  const rest = s.notOk.filter((n) => n.kind === 'link' || !acc.has(n.url));
  return rest.length ? { ...s, detail: `${s.record.id}: ${rest.slice(0, 3).map((n) => n.text).join('; ')}` } : { ok: true, detail: `${s.record.id}: all verified or accepted by name in the review (${[...acc.keys()].join(', ')})`, record: s.record };
}
