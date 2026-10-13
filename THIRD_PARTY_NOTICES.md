# Third-party notices

This repository's own material is © 2026 Simplified Tech Solutions. All rights reserved, subject to the actual copyrightability and ownership of the material. No general open-source or redistribution licence is granted for that material.

The notices below cover third-party material that is quoted in the framework snapshot under `engineering/` (see `engineering/NOTICE.md` and `sts-framework-snapshot.json`). They are kept here, outside the snapshot, because the snapshot is a verified copy of private framework files whose contents are fixed by an integrity record. Required licence texts are kept unaltered in `third-party-licenses/`.

## 1. Cloudflare Developer Documentation (Creative Commons Attribution 4.0 International)

* **Where it appears.** `engineering/hosting/provider-facts.json` holds 31 short excerpts from seven pages of the Cloudflare Developer Documentation. Each excerpt carries its source address in the file. The excerpts total about 2,900 characters.
* **Creator and copyright.** Cloudflare, Inc. and contributors: © Cloudflare, Inc. and contributors, repository `cloudflare/cloudflare-docs` (https://github.com/cloudflare/cloudflare-docs), published at https://developers.cloudflare.com/.
* **Licence.** Creative Commons Attribution 4.0 International Public License (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/ , legal code https://creativecommons.org/licenses/by/4.0/legalcode , as stated in the repository's `LICENSE` and `README.md`.
* **Disclaimer.** The excerpts are offered as is and as available, without representations or warranties of any kind, as set out in Section 5 of the licence. Neither Cloudflare nor its contributors endorses this project, its authors or this use of the excerpts.
* **Modifications.** None to the text of the excerpts. Each of the 31 excerpts was checked character for character against the source file named below (retrieved 2026-10-12, rechecked 2026-10-13). They were selected, and arranged with STS's own statements, by STS. Where `provider-facts.json` states a fact in its own words it is STS's paraphrase, not Cloudflare's text. Two of the source files have changed upstream since they were retrieved (`preview-deployments.mdx`, `migrate-from-pages.mdx`); the excerpts still appear verbatim in the current versions.
* **Sources** (raw file in `cloudflare/cloudflare-docs`, branch `production`; published page):
  * `src/content/docs/pages/configuration/headers.mdx` — https://developers.cloudflare.com/pages/configuration/headers/ (8 excerpts)
  * `src/content/docs/pages/configuration/serving-pages.mdx` — https://developers.cloudflare.com/pages/configuration/serving-pages/ (12)
  * `src/content/docs/pages/platform/limits.mdx` — https://developers.cloudflare.com/pages/platform/limits/ (4)
  * `src/content/docs/pages/configuration/preview-deployments.mdx` — https://developers.cloudflare.com/pages/configuration/preview-deployments/ (1)
  * `src/content/docs/pages/configuration/build-configuration.mdx` — https://developers.cloudflare.com/pages/configuration/build-configuration/ (2)
  * `src/content/docs/pages/get-started/direct-upload.mdx` — https://developers.cloudflare.com/pages/get-started/direct-upload/ (2)
  * `src/content/docs/workers/static-assets/migration-guides/migrate-from-pages.mdx` — https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/ (2)
* **Code in the documentation.** The repository licenses code under the MIT License, Copyright (c) 2021 Cloudflare, Inc. (`LICENSE-CODE`). Where an excerpt includes a short code or configuration line, that notice applies to it; the licence text is in `third-party-licenses/MIT-cloudflare-cloudflare-docs-code.txt`.
* **Trademarks.** Cloudflare and Cloudflare Pages are trademarks of Cloudflare, Inc. The licences grant no right to use Cloudflare names, logos or trademarks; they are used here only to say what the tests run against.

## 2. Vercel routing utilities (Apache License, Version 2.0)

* **Where it appears.** `engineering/hosting/provider-facts.json` holds 7 one-line excerpts of source code from the open-source repository `vercel/vercel` (https://github.com/vercel/vercel), about 200 characters in all, as evidence of how the Vercel routing library behaves.
* **Copyright.** Copyright 2017 Vercel, Inc. (as stated in the repository's `LICENSE`). The repository has no `NOTICE` file.
* **Licence.** Apache License, Version 2.0, http://www.apache.org/licenses/LICENSE-2.0 . A copy, unaltered, is in `third-party-licenses/Apache-2.0-vercel-vercel.txt`.
* **Changes.** None. The seven lines are quoted exactly as written (checked character for character against the source files, rechecked 2026-10-13); they are not compiled, executed or redistributed as software. STS's statements around them are its own.
* **Sources:**
  * https://github.com/vercel/vercel/blob/main/packages/routing-utils/src/superstatic.ts (6 excerpts)
  * https://github.com/vercel/vercel/blob/main/packages/routing-utils/src/index.ts (1 excerpt)
* **Trademarks.** Vercel is a trademark of Vercel, Inc. Used only to say what the tests run against. Nothing here is endorsed by Vercel.

## 3. Other third-party material

* **Development tools.** `engineering/package.json` and `engineering/package-lock.json` (and this project's own `package.json` files) name third-party packages installed from the npm registry. Their code is not part of this repository; each package keeps its own licence, recorded in the lockfile and in the software bill of materials the verification produces.
* **Creative authority.** The standards name the Anthropic Frontend Design skill by path, checksum and licence name only; none of its content is included.
* **Product names.** Chromium, Firefox, WebKit, Playwright, GitHub and other names belong to their owners and are used only to say what the tests run against.
