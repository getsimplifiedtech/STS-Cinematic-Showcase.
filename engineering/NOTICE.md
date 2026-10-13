# Notice (the STS engineering files in this repository)

## What these files are

`engineering/` and `.github/actions/engineering/` are a verified copy ("snapshot") of the files of the STS engineering that this repository's verification runs. They are copied from a private STS repository at an exact commit; `sts-framework-snapshot.json` lists every file, its checksum and that commit. They are published so that the verification of this project can be inspected and reproduced. They are not a product and not an open-source project.

## Copyright and licence

© 2026 Simplified Tech Solutions. All rights reserved, subject to the actual copyrightability and ownership of the material.

The copyright notice applies to the STS-authored material in these files only. Third-party material keeps its own licence and the notices below are to be preserved with it.

**No licence is granted for the STS-authored material.** Reading and forking this repository on GitHub are permitted by GitHub's Terms of Service and nothing more. Any other use, copying, modification or distribution of these files needs the written permission of the copyright holder.

## Third-party material

* **Provider documentation excerpts.** `engineering/hosting/provider-facts.json` holds short quotations, each with its source address, from (a) the Cloudflare documentation repository `cloudflare/cloudflare-docs`, © Cloudflare, Inc., licensed under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/); the excerpts are quoted as written and selected by STS; and (b) the source code of `vercel/vercel`, licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0); the excerpts are quoted as written. Other statements in that file are STS's own paraphrases. Nothing in it is endorsed by either provider.
* **Development tools.** `engineering/package.json` and `engineering/package-lock.json` name the third-party packages the verification installs from the npm registry (exact versions and integrity values). They are not part of this repository; each remains under its own licence, recorded in the lockfile and in the software bill of materials the verification produces.
* **Creative authority.** The standards name the Anthropic Frontend Design skill by path, checksum and licence name (Apache-2.0) only; none of its content is included.
* **Test images.** The two images of the generic fixture are abstract rectangles drawn by a script written by STS (`engineering/fixtures/generic/media/PROVENANCE.md`); no third-party rights are involved.
* Product and company names (Cloudflare, Vercel, Chromium, Firefox, WebKit and others) belong to their owners and are used only to say what the tests run against.
