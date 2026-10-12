# G6-3A proof of concept: mutation results

Each row breaks one guard of the release-control code (one line changed in a throwaway copy) and runs `check:selftest-release-control`. A guard counts as tested when the self-test fails. Two rounds: the first found nine surviving mutants; six were real gaps and got new test cases (M35, M36, M37, M42, M46, M49), M33 was dead code (a recovery step that no path needed) and was removed, three remain with the reasons below. Synthetic; no real component is involved.

| # | Broken guard | Result |
|---|---|---|
| M01 | artifact tree digest not checked | caught |
| M02 | agent holds approve and stage | caught |
| M03 | runner receipt not checked | caught |
| M04 | any HTML structure change counts as text | caught |
| M05 | material changes may auto-release | caught |
| M06 | unrecorded subjects ignored | caught |
| M07 | stages never expire | caught |
| M08 | preview not matched to the package | caught |
| M09 | package host not matched to the client | caught |
| M10 | tooling pin not enforced | **survives**: Survives alone because the same pin is enforced a second time on the verification copy (M36). With both removed together the pin tests fail (checked by hand). |
| M11 | text-edit size limit removed | caught |
| M12 | older stages never superseded | caught |
| M13 | preauthorisation limit ignored | caught |
| M14 | freeze ignored | caught |
| M15 | stray package files accepted | caught |
| M16 | revoked approvals still count | caught |
| M17 | a released stage can be released again | caught |
| M18 | ledger head not compared (truncation) | caught |
| M19 | deploy credential not checked | caught |
| M20 | client scope of a credential ignored | caught |
| M21 | scheduler may replace a pending material stage | caught |
| M22 | automatic releases become the baseline | caught |
| M23 | one-step approval does not need the subjects named | caught |
| M24 | anchor copy of the head ignored | caught |
| M25 | a missing ledger is a fresh start | caught |
| M26 | ZIP declared size not checked | caught |
| M27 | package root symlink accepted | caught |
| M28 | serve.py not compared with the held copy | caught |
| M29 | release mode not whitelisted | caught |
| M30 | emergency controls cannot break a stuck lock | caught |
| M31 | a dead holder keeps the lock | caught |
| M32 | no release-started entry | caught |
| M34 | tooling adoption allowed for a one-client owner | caught |
| M35 | adoption does not check every ledger first | caught (after a test was added) |
| M36 | verification copy not re-pinned | caught (after a test was added) |
| M37 | package copy not re-checked after verification | caught (after a test was added) |
| M38 | stale baseline not detected | caught |
| M39 | data files not restricted | caught |
| M40 | self-closing script trusted | **survives**: Equivalent mutant: the tokenizer treats `<script/>` as a script start tag exactly as a browser does, so trusting it changes no classification. |
| M41 | spaced script end tag trusted | caught |
| M42 | comment inside script trusted | caught (after a test was added) |
| M43 | unknown markup trusted | caught |
| M44 | invalid UTF-8 repaired silently | caught |
| M45 | raw-text elements trusted | caught |
| M46 | tracked project data changes ignored | caught (after a test was added) |
| M47 | changed approval subjects ignored | caught |
| M48 | first release judged against nothing is routine | caught |
| M49 | non-HTML change counts as text | caught (after a test was added) |
| M50 | live revoked does not block automatic release | **survives**: Unreachable behind the stale-baseline refusal (revoking the live release changes the baseline first); kept as defence in depth. |

49 mutants: 46 caught, 3 survive for the stated reasons. The self-test has 41 cases.
