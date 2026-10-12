// The page the owner reads before approving a material release (G6-3A proof of concept). Everything that came from the client's package is ESCAPED DATA; the only
// instruction on the page is written by release control itself. The owner never copies or types a digest: the command names the stage and the engine matches the digest.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function reviewHtml({ client, stageId, stage, checks, cls, coverage, previewRel }) {
  const rows = (a) => a.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const material = cls.class === 'material';
  const need = coverage.filter((c) => !c.covered);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Release review — ${esc(client)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:.3rem .5rem;text-align:left}.ok{color:#0a6b2a}.no{color:#a11}.box{border:2px solid #333;padding:.8rem 1rem;margin:1rem 0}</style></head><body>
<h1>Release review: ${esc(client)}</h1>
<p>Stage <strong>${esc(stageId)}</strong>, version ${esc(stage.version)}, source commit ${esc(String(stage.commit).slice(0, 12))}. SYNTHETIC PROOF OF CONCEPT: nothing here is deployed to a real host.</p>
<div class="box"><strong>${material ? 'MATERIAL change: your approval is required.' : `Routine change (${esc(cls.class)}): it can go out automatically if a preauthorisation is in force.`}</strong><ul>${cls.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
<h2>1. Look at the staged website</h2><p>This is the exact staged copy, not a link from anyone: <a href="${esc(previewRel)}/index.html">open the staged site</a> (a local file).</p>
<h2>2. Checks run on the staged bytes</h2><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${checks.map((c) => `<tr><td>${esc(c.id)}</td><td class="${c.ok || c.id === 'authenticity' ? 'ok' : 'no'}">${c.id === 'authenticity' ? 'decided by you' : c.ok ? 'pass' : 'FAIL'}</td><td>${esc(String(c.detail).slice(0, 220))}</td></tr>`).join('')}</table>
<h2>3. What changed</h2>${cls.changes.length > 25 ? `<p>${cls.changes.length} files (first 25 shown).</p>` : ''}<table><tr><th>File</th><th>Change</th></tr>${rows(cls.changes.slice(0, 25).map((c) => [c.name, c.change + (c.chars ? ` (${c.chars} characters)` : '')]))}</table>
<h2>4. Decisions only you can record</h2>${need.length ? `<table><tr><th>Subject</th><th>Status</th></tr>${rows(coverage.map((c) => [c.type, c.covered ? 'already recorded for exactly this content' : 'NOT recorded: run the command below']))}</table><ul>${need.map((c) => `<li><code>record-approval --client ${esc(client)} --stage ${esc(stageId)} --type ${esc(c.type)} --note "…"</code></li>`).join('')}</ul>` : '<p>Every subject is already recorded for exactly this content.</p>'}
<h2>5. Approve</h2><div class="box"><code>approve --client ${esc(client)} --stage ${esc(stageId)}</code><br>Release control checks the digest of this stage itself; you do not type one.</div>
</body></html>
`;
}
