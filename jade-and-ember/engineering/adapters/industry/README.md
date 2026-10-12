# Industry adapters (G6-5, APR-JE-046; decision D-P4-2)

An industry adapter holds what only one kind of business has, so that the base engineering can serve every website offering (Essential, Premium, Cinematic) and every industry
with the same checks. The base engineering asks the adapter named by the project manifest (`sts.engineering.json`, `industry`); it never names an industry. A project with
no adapter sets `industry: null`. Then the checks an adapter adds do not exist for that project, and the checks that use an adapter's knowledge (media, structured data) say in their notes what they did not run. The manifest is part of the engine digest, so removing an adapter is part of a sealed, reviewable change.

An adapter is a folder `adapters/industry/<id>/` with two files.

| File | Holds |
|---|---|
| `adapter.json` | `id`, `title`, and `checks`: the checks the industry adds to the registry, in the registry's entry shape (`id`, `module` relative to the engineering folder, `export`, `tier`, `after`, `scope`, `reason`, `describe`, `needs`). They are merged into the report after the check each one names. |
| `index.mjs` | `id`; `schemaType`; `allowedTypes` (the schema.org types the Home page's JSON-LD may carry); `summary` (how `check:seo` names what the structured data must match); `businessNoun`; `fieldProblems(ld, cfg)` and `pageProblems(ld, cfg)` (fields only this industry has and the page links that tie the data to the site); `llmsFacts` and `llmsFactProblems(fact, biz)` (extra fact lines of `llms.txt`). |

What stays out of an adapter: anything an aesthetic decision would change. The adapter validates data; it never sets a colour, a font or a layout, and the creative authority
(Anthropic Frontend Design) is not consulted or restated here.

The first adapter is `restaurant` (Jade & Ember). Its configuration schemas (`menu`, `copy`) and component contracts are the checks `check:schema` and `check:contracts`;
the code of the components themselves belongs to the project's renderer (FM-28) and is reached by the contract check through the project, not through the engineering.
The Restaurant JSON-LD generator (`src/lib/seo.mjs`) is a project-owned module reached through `generators.seo` in the manifest; moving it into the framework
(R-02) changes the renderer and is part of the extraction (G6-6), not of G6-5.
