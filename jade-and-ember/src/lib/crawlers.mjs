// Crawler classes for the robots.txt policy (client.seo.crawlers). The three classes follow the distinction the STS search and AI discovery
// standard asks for: search indexing, AI search and retrieval, and model training. A class is allowed or disallowed as a whole.
//
// LIMITS, stated on purpose:
//  - robots.txt is a request, not an access control. It does not control every AI system, does not hide anything and guarantees no appearance
//    in or exclusion from any search result or AI answer.
//  - Not every provider separates the classes. Google uses one crawler (Googlebot) for search and for its AI search features, so those cannot
//    be told apart; Google-Extended is a control token for model training and grounding, not a separate crawler. Bing's AI answers use Bingbot.
//  - Some fetches are made on behalf of a person typing a request (the *-User agents); providers state that robots.txt may not apply to
//    those, and they are listed so a client can choose, not as a guarantee.
//  - The agent names were re-checked on 2026-10-11 against summaries of the providers' official pages (the pages themselves could not be fetched
//    from the sandbox); the dated, sourced record is engineering/search-crawler-verification.json; `npm run check:seo` fails if it is missing or
//    disagrees with this list, and the release gate refuses a client-production build while a person has not re-read the pages (confirmedByPerson is
//    false there today) or the review is older than its stated age limit.
//    Providers add and rename agents without notice: re-verify before each production release; the search review (release gate) records it.
export const CRAWLERS = Object.freeze({
  reviewed: '2026-10-11',
  verifiedAgainstProviderDocs: false,   // a person has not re-read the pages; see engineering/search-crawler-verification.json (confirmedByPerson)
  classes: Object.freeze({
    search: Object.freeze({
      meaning: 'search indexing: the crawlers that build the classic search indexes',
      agents: Object.freeze(['Googlebot', 'Bingbot', 'DuckDuckBot', 'Applebot']),
      required: 'allow',
    }),
    aiSearch: Object.freeze({
      meaning: 'AI search and retrieval: crawlers that index for AI search products, and fetches made for a person using an AI assistant',
      agents: Object.freeze(['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User']),
    }),
    training: Object.freeze({
      meaning: 'model training: crawlers and control tokens used to collect content for training AI models',
      agents: Object.freeze(['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent']),
    }),
  }),
});
export const CRAWLER_CLASSES = Object.keys(CRAWLERS.classes);
export const KNOWN_AGENTS = Object.values(CRAWLERS.classes).flatMap((c) => c.agents);

// The policy with defaults filled in. Absent means every class allowed, which is the plain `User-agent: *  Allow: /` file.
export const policyOf = (seo) => ({ search: 'allow', aiSearch: 'allow', training: 'allow', ...(seo.crawlers || {}) });

// The agents the policy asks to keep out, in the order of the classes.
export const blockedAgents = (policy) => CRAWLER_CLASSES.filter((c) => policy[c] === 'disallow').flatMap((c) => CRAWLERS.classes[c].agents);
