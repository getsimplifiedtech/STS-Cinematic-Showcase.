// The generic local-business industry adapter (specification 16, 7.1): the default for a project whose industry has no adapter of its own. It knows only what every local
// business shares, which the base already validates, so each hook below is minimal. An industry with more to say (a restaurant's cuisine and menu, for example) has its own adapter.
export const id = 'local-business';
export const schemaType = 'LocalBusiness';
export const defaultType = 'LocalBusiness';
export const idFragment = 'business';
// what a visitor would take a demonstration for if it were not labelled (used in the demonstration notes of check:seo)
export const businessNoun = 'business';
// a plausible real domain that must not be mistaken for a staging host (check:seo)
export const realLookingDomain = 'studio.business';
// check:seo's hostile-input case: the industry fields of seo.business that carry text into the page and the structured data (none here, so the base field is used)
export function hostileFields(business, evil) { business.description = evil; }
// the facts a person compares with the client when reviewing the search artifacts (tools/release.mjs prints them)
export const factsList = 'name, address, phone, hours';
export const allowedTypes = ['LocalBusiness', 'ProfessionalService', 'Store', 'HomeAndConstructionBusiness', 'LegalService', 'FinancialService', 'HealthAndBeautyBusiness', 'AutomotiveBusiness'];
export const summary = 'LocalBusiness matching the configuration (name, phone, address, hours, image)';
// no extra fact lines in llms.txt
export const llmsFacts = [];
export const llmsFactProblems = () => [];
export const fieldProblems = () => [];
export const pageProblems = () => [];
export const structuredFields = () => ({});
export const llmsLines = () => [];
// What the configuration declares about media, for check:media to hold against the files: the images named in copy.media (a list of [file, width, height]) and no video.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function declaredMedia(root) {
  const f = join(root, 'config', 'copy.json');
  if (!existsSync(f)) return { images: [], video: null };
  const copy = JSON.parse(readFileSync(f, 'utf8'));
  return { images: (copy.media?.images || []).map((i) => [i.src, i.width, i.height]), video: copy.media?.video || null };
}
