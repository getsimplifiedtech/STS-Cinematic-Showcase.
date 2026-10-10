// Console messages that one engine writes about correct markup (Gate 5). They are counted and reported, never silently dropped, and the
// engine that writes them is part of the match: the same message in any other engine is NOT filtered and fails the check that saw it.
//   F-G5-02  Firefox logs a warning for a <link rel="preload" as="image" media="..."> whose media query does not match the current viewport,
//            which is the whole purpose of the attribute: the hero image has one preload per art direction and only one can match.
const PRELOAD_MEDIA = /Preload of \S*media\/hero-wok(-m)?\.webp was ignored due to unknown .as. or .type. values, or non-matching .media. attribute/;
export const engineNoise = (engine, text) => (engine === 'firefox' && PRELOAD_MEDIA.test(text) ? 'F-G5-02' : null);
