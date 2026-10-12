// node engineering/release-control/cli.mjs <command> [--rc <folder>] [--credential <token file>] [--client <name>] ...
// SYNTHETIC PROOF OF CONCEPT (G6-3A, APR-JE-043). It runs only on a folder that `init-demo` created, with disposable tokens, and deploys only into that folder.
//   init-demo --rc <folder> --clients a,b [--hosts a=www.a.com,b=www.b.com] [--tooling <engineering folder>]   create a throwaway release-control folder and write the disposable tokens to <folder>/operator/
//   stage --client c --package <release folder>          verify, classify and stage a prepared package; prints the review page
//   review --client c --stage <id> [--json]               print the status, the class and what still needs your decision
//   record-approval --client c --stage <id> --type rights|search|externalLinks|domain --note "..." [--basis licence|permission|ownership]
//   approve --client c --stage <id> [--note "what I checked" --subjects rights,search,... [--basis licence]]   release a staged package (the owner); the digest is matched by the engine, never typed.
//                                                        With --note, the subjects you name (they must be exactly the ones still open for THIS stage) are recorded with that note first
//   auto-release --client c --stage <id>                 release a ROUTINE staged package under a preauthorisation (the scheduler)
//   run-scheduled --client c --package <release folder>  stage, then release automatically only if routine and preauthorised
//   revoke --client c --stage <id> --reason "..."  |  revoke-approval --client c --approval <n> --reason "..."
//   freeze|unfreeze --client c --reason "..."  |  preauth-grant --client c --kinds identical,text-only --days 30 --max 10  |  preauth-revoke --client c --id pa-N
//   adopt-tooling  |  audit --client c  |  status --client c
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReleaseControl } from './lib/engine.mjs';
import { initRc } from './lib/state.mjs';
import { engDir } from '../lib/git.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const arg = (n, d = null) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const fail = (m, code = 1) => { console.error(m); process.exit(code); };

try {
  if (cmd === 'init-demo') {
    const dir = resolve(arg('--rc') || fail('--rc <folder> is required', 2)), clients = (arg('--clients') || fail('--clients a,b is required', 2)).split(',');
    const { tokens, clientTokens } = initRc(join(dir, 'rc'), { clients, hosts: Object.fromEntries((arg('--hosts') || '').split(',').filter(Boolean).map((x) => x.split('='))), tooling: resolve(arg('--tooling') || engDir) });
    mkdirSync(join(dir, 'operator'), { recursive: true, mode: 0o700 });
    for (const [k, v] of Object.entries(tokens)) writeFileSync(join(dir, 'operator', `${k}.token`), v + '\n', { mode: 0o600 });
    console.log(`created ${join(dir, 'rc')} (clients: ${clients.join(', ')})\ndisposable tokens: ${join(dir, 'operator')}/{owner,scheduler,agent}.token\nSYNTHETIC: nothing here is a real credential, repository or host. (${Object.keys(clientTokens).length} per-client deploy tokens are in rc/vault/.)`);
    process.exit(0);
  }
  const rcDir = resolve(arg('--rc') || process.env.RC_DIR || fail('--rc <folder> (or RC_DIR) is required', 2));
  const credFile = arg('--credential') || process.env.RC_CREDENTIAL;
  const token = credFile ? readFileSync(credFile, 'utf8').trim() : '';
  const rc = new ReleaseControl(rcDir);
  const client = arg('--client'), stage = arg('--stage');
  const show = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
  const run = {
    'stage': () => { const r = rc.stage(token, client, resolve(arg('--package'))); show(`STAGED ${r.stageId}: ${r.class.toUpperCase()}\n${r.reasons.map((x) => `  - ${x}`).join('\n')}\nreview page: ${r.review}\nstill to record: ${r.coverage.filter((c) => !c.covered).map((c) => c.type).join(', ') || 'nothing'}\nexpires: ${r.expires}`); },
    'review': () => {
      const r = rc.review(token, client, stage);
      if (argv.includes('--json')) return show(r);
      show(`STAGE ${r.stageId}: ${r.status.toUpperCase()}, ${r.class.toUpperCase()}\n${r.reasons.map((x) => `  - ${x}`).join('\n')}\nyour decisions:\n${r.coverage.map((c) => `  ${c.type.padEnd(14)} ${c.na ? 'nothing to approve' : c.covered ? `recorded (entry ${c.by})` : 'NOT recorded yet'}`).join('\n')}\nreview page: ${r.page}`);
    },
    'record-approval': () => { const r = rc.recordApproval(token, client, stage, arg('--type'), { note: arg('--note'), basis: arg('--basis') }); show(`RECORDED ${r.type} for exactly this stage's content (entry ${r.seq}, in force until ${r.validUntil.slice(0, 10)}); the digest was read from the stage, not typed`); },
    'approve': () => { const r = rc.approve(token, client, stage, { note: arg('--note'), basis: arg('--basis'), subjects: (arg('--subjects') || '').split(',').filter(Boolean) }); show(`RELEASED ${r.stageId} (${r.class}) to ${r.target}; deployed digest ${r.deployedDigest.slice(0, 16)}… matched the staged files`); },
    'auto-release': () => { const r = rc.autoRelease(token, client, stage); show(`RELEASED AUTOMATICALLY ${r.stageId} (${r.class}) to ${r.target}; deployed digest ${r.deployedDigest.slice(0, 16)}… matched the staged files`); },
    'run-scheduled': () => { const r = rc.runScheduled(token, client, resolve(arg('--package'))); show(r.outcome === 'released-auto' ? `RELEASED AUTOMATICALLY ${r.release.stageId} (${r.stage.class}) to ${r.release.target}: a preauthorisation covered it; digest matched by the engine` : `WAITING FOR THE OWNER: stage ${r.stage.stageId} is ${r.stage.class.toUpperCase()}${r.why ? ` and ${r.why === 'no-preauth' ? 'no preauthorisation covers it' : r.why}` : ''}\n  ${r.stage.reasons.join('\n  ')}\nreview page: ${r.stage.review}`); },
    'revoke': () => { const r = rc.revoke(token, client, stage, arg('--reason')); show(`REVOKED ${r.ref} (entry ${r.seq})`); },
    'revoke-approval': () => { const r = rc.revokeApproval(token, client, arg('--approval'), arg('--reason')); show(`REVOKED approval ${r.ref} (entry ${r.seq})`); },
    'freeze': () => { rc.freeze(token, client, arg('--reason'), true); show(`FROZEN ${client}: nothing can be staged or released until the owner unfreezes it`); },
    'unfreeze': () => { rc.freeze(token, client, arg('--reason'), false); show(`UNFROZEN ${client}`); },
    'preauth-grant': () => { const r = rc.preauthGrant(token, client, { kinds: (arg('--kinds') || '').split(',').filter(Boolean), days: Number(arg('--days')), max: Number(arg('--max')) }); show(`PREAUTHORISED ${r.id}: routine ${r.kinds.join(' and ')} releases for ${client}, up to ${r.max}, for ${r.days} days. Material changes still need you.`); },
    'preauth-revoke': () => { const r = rc.preauthRevoke(token, client, arg('--id')); show(`PREAUTHORISATION ${r.id} REVOKED`); },
    'adopt-tooling': () => show(rc.adoptTooling(token)),
    'audit': () => { const r = rc.audit(token, client); show(`${r.ok ? 'LEDGER VERIFIES' : 'LEDGER DOES NOT VERIFY'}\n${r.problems.map((p) => `  PROBLEM: ${p}`).join('\n')}\n${r.timeline.join('\n')}`); process.exitCode = r.ok ? 0 : 1; },
    'status': () => show(rc.status(token, client)),
  }[cmd];
  if (!run) fail('usage: cli.mjs init-demo|stage|review|record-approval|approve|auto-release|run-scheduled|revoke|revoke-approval|freeze|unfreeze|preauth-grant|preauth-revoke|adopt-tooling|audit|status (see the header of this file)', 2);
  run();
} catch (e) { console.error(`REFUSED${e.code ? ` [${e.code}]` : ''}: ${e.message}`); process.exit(1); }
