# G6-4 hosting adapters: mutation results

Each row breaks one guard of the adapter code (one line changed in place; the file is restored afterwards) and runs `node engineering/checks/hosting-adapters.mjs`. A guard counts as tested when that check fails. Synthetic: no host, provider or credential is involved. The independent review of the adapters (a separate model session, not a person) came first; its findings were fixed and each fix has a case here.

| # | Broken guard | Result |
|---|---|---|
| M01 | channel that disagrees with the pages accepted | caught |
| M02 | mixed noindex build accepted | caught |
| M03 | symbolic link accepted | caught |
| M05 | deployed-bytes comparison ignores changed bytes | caught |
| M06 | deployed-bytes comparison ignores extra served paths | caught |
| M10 | files in the bundle but not in the manifest ignored | caught |
| M11 | bytes not compared with the manifest | caught |
| M12 | site tree hash not compared | caught |
| M13 | the adapter's own files not enforced | caught |
| M14 | unsafe manifest paths accepted | caught |
| M15 | regenerate-and-compare disabled | caught |
| M16 | release blockers not enforced | caught |
| M17 | missing search files accepted | caught |
| M18 | demonstration may publish search files | caught |
| M19 | release-package files accepted in the site | caught |
| M20 | non-static file types accepted | caught |
| M21 | hidden files accepted | caught |
| M22 | host and secret file names accepted | caught |
| M23 | HSTS opt-in not validated when staging | **survives**: Equivalent mutant: the same HSTS validation also runs inside every renderer, so removing the early check in the bundle writer changes no outcome. |
| M24 | delivered folder not compared | caught |
| M25 | host file-size limit ignored | caught |
| M30 | default HSTS may contain includeSubDomains | caught |
| M32 | no request-path cache rule for clean URLs | caught |
| M40 | includeSubDomains in _headers accepted | caught |
| M41 | HSTS value not compared with the policy | caught |
| M42 | HSTS preload accepted | caught |
| M43 | security header in a second rule accepted | caught |
| M44 | Cache-Control in the catch-all rule accepted | caught |
| M45 | more than 100 rules accepted | caught |
| M46 | over-long header lines accepted | caught |
| M47 | control characters in a header accepted | caught |
| M48 | page cache rules for clean URLs not required | caught |
| M49 | stale CSP accepted in _headers | caught |
| M50 | extension URLs accepted on Cloudflare Pages | caught |
| M51 | demonstration without X-Robots-Tag accepted (Cloudflare) | caught |
| M52 | X-Robots-Tag on an indexable build accepted (Cloudflare) | caught |
| M53 | base URL with a path accepted | caught |
| M60 | cleanUrls not matched to the URL style | caught |
| M61 | trailingSlash not required to be false | caught |
| M62 | unknown vercel.json keys accepted | caught |
| M63 | framework not required to be null | caught |
| M64 | outputDirectory not checked | caught |
| M65 | any header source form accepted | caught |
| M66 | .html source accepted with cleanUrls | caught |
| M67 | security header outside the global entry accepted | caught |
| M68 | global entry need not come first | caught |
| M69 | route limit ignored | caught |
| M70 | header values not compared with the policy | caught |
| M71 | includeSubDomains in vercel.json accepted | caught |
| M72 | extra keys in a headers entry accepted | caught |
| M73 | control characters in a vercel.json value accepted | caught |
| M74 | Cache-Control in the global entry accepted | caught |
| M75 | duplicate keys in vercel.json accepted | caught |
| M76 | stale CSP accepted in vercel.json | caught |
| M77 | demonstration without X-Robots-Tag accepted (Vercel) | caught |
| M80 | server header values not compared (static) | caught |
| M81 | a missing server header accepted (static) | caught |
| M90 | Cloudflare profile: no single-page fallback | caught |
| M91 | Vercel profile: no trailing-slash redirect | caught |
| M92 | Cloudflare profile: .html form not redirected | caught |
| M93 | Cloudflare profile: _headers served | caught |
| M94 | Cloudflare profile: Range answered with 206 | caught |
| M95 | Vercel profile: cleanUrls redirect removed | caught |
| N01 | output folder that contains the delivered folder accepted | **survives**: Redundant: the same case (the parent folder as output) is still refused by the "not empty and not a bundle" rule, and the delivered folder is intact. Kept as defence in depth. |
| N02 | output folder inside the delivered folder accepted | caught |
| N03 | non-empty unrelated output folder accepted | caught |
| N04 | clean-URL host may serve the .html form | caught |
| N05 | soft 404 not detected | caught |
| N07 | manifest notes may be edited | caught |
| N08 | manifest settingsToApply may be edited | caught |
| N09 | unknown manifest fields accepted | caught |
| N10 | credential-shaped text accepted | caught |
| N11 | nested HTML pages accepted | caught |
| N12 | upper-case extensions accepted | caught |
| N13 | scripts and styles inside asset folders accepted | caught |
| N14 | folder that collides with a page accepted | caught |
| N15 | project folders accepted in the site | caught |
| N16 | search file with the wrong case accepted | caught |
| N17 | 404.html that copies index.html accepted | caught |
| N18 | 404.html with a meta refresh accepted | caught |
| N19 | 404.html without text accepted | caught |
| N20 | sitemap in the other URL style accepted | caught |
| N21 | canonical links in the other URL style accepted | caught |
| N22 | http base URL accepted | caught |
| N23 | base URL with a password accepted | caught |
| N24 | HSTS authorisation need not be listed | caught |
| N25 | unknown HSTS options accepted | caught |
| N26 | includeSubDomains need not be a boolean | caught |
| N27 | prototype keys accepted as adapters | caught |
| N28 | profile: /404 served as a page | caught |
| N29 | profile: paths may leave the site folder | **survives**: Redundant: the simulation server has its own root-escape guard, which catches the same requests. Kept as defence in depth. |
| N31 | noindex state counts 404.html | caught |
| N32 | manifest options unchecked | caught |
| N33 | manifest no-credential statement unchecked | caught |
| N34 | CSS and JS cache entries missing for nested files (Vercel) | caught |
| N35 | cloudflare profile: platform defaults not applied | caught |

96 mutants: 93 caught, 3 survive for the stated reasons (one equivalent, two redundant defences in depth).
