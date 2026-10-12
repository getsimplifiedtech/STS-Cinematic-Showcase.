// The restaurant (hospitality) industry adapter (G6-5, APR-JE-046; decision D-P4-2: Restaurant JSON-LD is retained for Jade & Ember and the framework supports
// industry-specific schemas). What only a restaurant's structured data has: its schema.org types, its cuisine and price range, and the link to its menu page.
// The generic local-business fields (name, url, image, telephone, address, opening hours, sameAs) are validated by lib/structured-data.mjs, which asks this adapter for the rest.
import { generator } from '../../../lib/generators.mjs';

export const id = 'restaurant';
export const schemaType = 'Restaurant';
// what a visitor would take the demonstration for if it were not labelled fictional (used in the demonstration notes of check:seo)
export const businessNoun = 'restaurant';
// a plausible real domain of this industry that must not be mistaken for a staging host (check:seo)
export const realLookingDomain = 'kitchen.restaurant';
// check:seo's hostile-input case: the industry fields of seo.business that carry text into the page and the structured data
export function hostileFields(business, evil) { business.servesCuisine = [evil]; }
// the facts a person compares with the client when reviewing the search artifacts (tools/release.mjs prints them)
export const factsList = 'name, address, phone, hours, cuisine, ordering link';
export const allowedTypes = ['Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'BarOrPub', 'Bakery', 'FastFoodRestaurant'];
// how check:seo names what the structured data of an indexable build must match
export const summary = 'Restaurant matching the configuration (name, phone, address, cuisine, hours, menu, image)';

// the extra fact lines of llms.txt (Visit and contact section) and how they must agree with seo.business
export const llmsFacts = ['Cuisine', 'Price range'];
export function llmsFactProblems(fact, biz) {
  const p = [];
  const cu = fact('Cuisine'); if (biz ? cu !== biz.servesCuisine.join(', ') : cu !== null) p.push(`llms.txt: the cuisine "${cu}" differs from seo.business.servesCuisine`);
  const pr = fact('Price range'); if (biz ? pr !== biz.priceRange : pr !== null) p.push(`llms.txt: the price range "${pr}" differs from seo.business.priceRange`);
  return p;
}

// fields only this industry has, from the structured data and the configuration it came from
export function fieldProblems(ld) {
  const p = [];
  if (!Array.isArray(ld.servesCuisine) || !ld.servesCuisine.length || ld.servesCuisine.some((c) => typeof c !== 'string' || !c)) p.push('servesCuisine must be a non-empty list of text');
  if (typeof ld.priceRange !== 'string' || !ld.priceRange) p.push('priceRange is required');
  return p;
}
// facts that tie the structured data to a page of the site (the menu page)
export function pageProblems(ld, cfg) {
  const { publicUrl } = generator('seo');
  const menu = cfg.pages.find((x) => x.id === 'menu');
  return ld.hasMenu !== publicUrl({ client: cfg.client, pages: cfg.pages }, menu) ? ['hasMenu must be the menu page\'s public URL'] : [];
}

// What the restaurant configuration (config/copy.json) declares about media, for check:media to hold against the files: the hero images, the menu band, the story image,
// and the hero video with its size and loop length. Read from the project folder it is given.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function declaredMedia(root) {
  const copy = JSON.parse(readFileSync(join(root, 'config', 'copy.json'), 'utf8'));
  const h = copy.home.hero;
  return {
    images: [[h.image.desktop, h.image.width, h.image.height], [h.image.mobile, h.image.mobileWidth, h.image.mobileHeight], [copy.menu.band.src, copy.menu.band.width, copy.menu.band.height], [copy.story.image.src, copy.story.image.width, copy.story.image.height]],
    video: h.video,
  };
}
