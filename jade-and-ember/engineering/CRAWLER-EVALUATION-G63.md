# Crawler evaluation: DuckAssistBot and Meta-ExternalFetcher (G6-3, decision D-P4-1, `APR-JE-040`)

The owner asked (D-P4-1, `APR-JE-033`) for DuckAssistBot and Meta-ExternalFetcher to be evaluated for Gate 6 **after verifying the official crawler documentation before assigning policies**, and (D-P4-4) for a dated human review of that documentation before a client release. This is the engineering part. It is **not** the human review and it assigns **no policy**.

## What could and could not be read

| Source | Result in this sandbox (2026-10-12) |
|---|---|
| `https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot` | not reachable (`getaddrinfo ENOTFOUND duckduckgo.com`) |
| `https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/` | not reachable (`getaddrinfo ENOTFOUND developers.facebook.com`) |
| Search summaries of the same pages | obtained; **a summary is not the page** and is recorded as such |

So the official pages were **not** read here. Nothing below may be treated as verified against the provider documentation.

## What the summaries say (to be confirmed by a person against the pages)

| Agent | Purpose according to the summaries | robots.txt |
|---|---|---|
| **DuckAssistBot** (DuckDuckGo) | a crawler for DuckDuckGo Search that fetches pages in real time for AI-assisted answers that cite their sources; DuckDuckGo says the data is not used to train AI models; a user-agent of the form `DuckAssistBot/1.x`; the bot's IP addresses are published in a JSON file on duckduckgo.com | opting out is a `Disallow` for the `DuckAssistBot` user agent; the page says the change takes about 72 hours and does not affect organic search results |
| **Meta-ExternalFetcher** (Meta) | fetches individual links at a user's request, supporting product functions; a separate token from **Meta-ExternalAgent** (the training and indexing crawler already in the `training` class) | Meta's page is summarised as saying this fetcher **may bypass robots.txt** because the fetch was requested by a user; third-party directories disagree, which is why only the provider's page counts |

These agree with what `engineering/search-crawler-verification.json` and `SEARCH-AUDIT-GATE5.md` already recorded on 2026-10-11.

## Proposed handling (a proposal for the owner and for the D-P4-4 human review; nothing was changed)

* **DuckAssistBot** would belong to the `aiSearch` class (answers retrieved at request time, with citation), blockable by a robots.txt `Disallow`. If the review confirms the page, adding it to the class is a one-line change to `src/lib/crawlers.mjs` and the crawler record, which G6-3 may not touch (`src/` and the crawler record are denied).
* **Meta-ExternalFetcher** is a user-initiated fetcher. If Meta's page says robots.txt may not govern it, the framework should treat it like the other `*-User` agents already documented: listed so a client can choose, **never presented as blocked by a robots.txt rule**. It needs a place in the crawler record's "may ignore robots.txt" list, not a class.
* Neither agent was added to the generated robots.txt, `llms.txt` or any delivered file. The delivered folder is unchanged.

## What still blocks a client release

`confirmedByPerson` in the crawler record is `false`: no person has re-read the providers' pages. The release gate (`searchReadiness`, through `crawlerReviewGaps`) refuses a client-production build until that is done and recorded, and until the review is within its age limit. G6-3 does not change that and does not invent the review.

## Decisions for the owner

1. Who re-reads the two pages (and the others in the crawler record) and files the dated note (D-P4-4)?
2. After that review, authorise the one-line additions in `src/lib/crawlers.mjs` and the record (a later work package; G6-3 is not allowed to edit them).
