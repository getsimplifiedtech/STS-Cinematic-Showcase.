// Which host names the release gate refuses as a PRODUCTION host (G6-2 review, F11). The build's own list (src/lib/seo.mjs, unchanged) stays as it is: it only warns, because the
// same configuration is legitimately built for staging. The gate adds what a release must also refuse: more hosting providers' preview domains, and a staging word anywhere in a
// SUB-domain label (stage2., preview-1., jade-staging., www-dev.). The registrable name itself (the last two labels) is the client's own and is never judged by its words.
import { isReservedHost as buildReserved } from '../../src/lib/seo.mjs';

const MORE_PREVIEW = /(^|\.)(netlify\.com|azurestaticapps\.net|cloudfront\.net|appspot\.com|repl\.co|replit\.(app|dev)|railway\.app|gitlab\.io|ngrok\.app|loca\.lt|amplifyapp\.com|azurewebsites\.net|pythonanywhere\.com|codesandbox\.io|stackblitz\.io|bubbleapps\.io)$/;
const STAGING_WORD = /^(staging|stage|stg|preview|dev|test|testing|demo|uat|qa|sandbox)$/;

export function isReservedHost(hostname) {
  if (buildReserved(hostname)) return true;
  const h = String(hostname).toLowerCase().replace(/\.$/, '');
  if (MORE_PREVIEW.test(h)) return true;
  return h.split('.').slice(0, -2).some((label) => label.split(/[-_]|(?<=[a-z])(?=\d)/).some((t) => STAGING_WORD.test(t)));
}
