# STS — Jade & Ember
## Cinematic Ambient Hero | Implementation Brief v1.0

**Project:** Jade & Ember — Modern Chinese Kitchen  
**Product:** STS Cinematic Ambient Hero (CAH)  
**Design authority:** ~~STS Premium Web Design v2.0~~ **retired, historical only; see Amendment 1 below. Active creative authority: Anthropic Frontend Design.**  
**Status:** Approved direction for initial development; publication requires review.  
**Repository:** `getsimplifiedtech/STS-Cinematic-Showcase.`  
**Target demo path:** `/jade-and-ember/`

> **Amendment 1 (2026-10-10): design authority.** Recorded by owner decision (`docs/JADE_AND_EMBER_APPROVALS.md`, APR-JE-009 and APR-JE-016); this note amends the brief without rewriting it.
>
> - The **STS Premium Web Design skill (v2.0) is retired and historical only**: `.claude/skills/sts-premium-web-design/`, `skills/PREMIUM_WEB_DESIGN.md` and the branch `claude/premium-web-design-skill`. Wherever this brief names it (the "Design authority" line, section 2, section 9 "methods from the STS skill", section 11 step 1), that instruction is **superseded**. Its aesthetic rules must not be applied to this project or combined with the active skill.
> - **Anthropic's Frontend Design skill (`frontend-design`) is the active creative authority**, pinned in `docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md` (framework commit and skill hashes). Policy: it governs creative direction; STS retains authority over architecture, engineering, accessibility, security, QA and delivery; STS visual packages may supply reusable implementation tokens and configurations but must not impose competing aesthetic rules.
> - **Unchanged and still binding:** every engineering, delivery and restriction requirement in this brief (sections 4 to 8, 10 and the non-aesthetic parts of 9), the fictional-content labelling, `noindex`, no Lovable dependency, and the **brief-pinned visual direction** (section 3: "a restrained palette of charcoal, jade, warm ember, and rice tones"), which the active skill treats as the client's own words.
> - The original text below is kept as the historical record of the brief as issued on 2026-10-09.

## 1. Objective

Build a premium, original Chinese restaurant demonstration website for Simplified Tech Solutions.

The experience must demonstrate a commercially deliverable restaurant website, not an experimental animation showcase.

Create a complete, responsive, standalone website suitable for deployment on Cloudflare Pages.

## 2. Required design standard

> **[Superseded by Amendment 1: historical only.]** The files named in this section describe the retired design authority. The engineering conventions in the template are still useful as lineage; the aesthetic rules are not applied.

Read the following files from the private GitHub repository `getsimplifiedtech/sts-web-design-framework`, branch `claude/premium-web-design-skill`:

- `.claude/skills/sts-premium-web-design/SKILL.md`
- `skills/PREMIUM_WEB_DESIGN.md`
- Applicable components from `templates/sts-cinematic-template-v02/`

Apply the complete design standard, including brand-specific art direction, typography, composition, motion restraint, accessibility, performance, and anchored critique.

The template folder's name is v02, but its `package.json` reports implementation version 0.3.0. Reuse suitable technical patterns without carrying over the architecture-specific aesthetic or scroll-scrub experience.

## 3. Brand direction

**Brand:** Jade & Ember  
**Descriptor:** Modern Chinese Kitchen  
**Visual thesis:** Chinese cooking expressed through fire, steam, texture, and precise culinary presentation.

Use a restrained palette of charcoal, jade, warm ember, and rice tones.

Choose typography and composition based on the brand rather than reproducing the architectural template's appearance.

The website must remain visually compelling with video disabled.

## 4. Cinematic hero

Feature one premium cinematic food preparation sequence centered on wok cooking.

Requirements:

- Convincing food realism.
- Believable fire, steam, and ingredient movement.
- Controlled composition with space for typography.
- Short, lightweight video loop.
- High-quality poster image.
- Pause motion control.
- Reduced-motion and save-data fallbacks.
- Mobile-specific cropping and layout.
- No generated-video credits spent without reviewing the source frame and production plan.

The initial implementation should use a still-image hero. Video production and integration are separate approval gates.

## 5. Restaurant functionality

Provide:

- Homepage and cinematic hero.
- Signature dishes.
- Browseable restaurant menu.
- Restaurant story.
- Location and hours.
- Responsive navigation.
- Clear menu and online-ordering calls to action.

All restaurant information, menu prices, addresses, and operating hours must be fictional and appropriately labeled. Do not accidentally direct users to a real restaurant, phone number, or address.

## 6. MenuSifu approach

Design for restaurants using an existing MenuSifu ordering platform.

Do not build a payment processor, production cart, or POS integration.

Support an externally configurable ordering URL. In the demo, label the ordering destination as a nonfunctional example until a genuine destination is available.

Do not claim to have verified a MenuSifu API, iframe, checkout, or partnership integration without evidence.

## 7. Engineering requirements

- Standalone HTML, CSS, and JavaScript.
- Minimal dependencies.
- Static hosting compatibility.
- Reusable restaurant configuration.
- No Lovable dependency.
- Responsive desktop, tablet, and mobile compositions.
- Accessibility and Lighthouse validation.
- No invented real-device test results.
- Treat untested iPhone/Safari behavior as **[unverified]**.
- Check applicable WCAG 2.2.2 requirements for auto-playing motion lasting over five seconds; reduced-motion support does not automatically replace a user-accessible pause control.

## 8. Delivery structure

Target deployment:

`https://sts-cinematic-showcase.pages.dev/jade-and-ember/`

Keep the existing STS showcase homepage operational.

Develop and review on a separate GitHub branch before merging into `main`.

The public showcase is an STS concept gallery; include clear attribution that Jade & Ember is fictional.

## 9. Acceptance criteria

The website must:

1. Look distinctively Jade & Ember, not like a generic restaurant template.
2. Demonstrate genuine cinematic value once video is approved and integrated.
3. Work without cinematic video.
4. Provide practical restaurant navigation.
5. Load efficiently on mobile.
6. Avoid unsupported functionality and misleading claims.
7. Pass applicable automated QA, with limitations explicitly documented.
8. Be reproducible for another restaurant through controlled content and asset changes.

Use the premium-versus-template distinction, brand swap test, visual thesis, and anchored critique methods from the STS skill. **[Superseded by Amendment 1: historical only. The critique method is now Frontend Design's plan, review-against-defaults and self-critique process.]** Do not invent a numeric score threshold.

## 10. Restrictions

- Do not reuse Panda House assets, code, restaurant data, or photographs.
- Do not work on the Scroll-Scrub Cinematic Experience.
- Do not modify Lovable.
- Do not generate paid video assets, merge to `main`, or publish without explicit authorization.
- Do not alter the existing live STS showcase homepage while preparing this brief.

**First implementation milestone:** Produce the responsive Jade & Ember website using a high-quality still-image hero. Establish all website functionality and styling before adding generated cinematic footage.

## 11. Delivery sequence

1. Apply STS skill and develop the art direction. **[Superseded by Amendment 1: apply the Frontend Design skill.]**
2. Build standalone restaurant pages with the still-image hero.
3. Validate navigation, mobile layout, accessibility, and performance.
4. Plan and review the cinematic hero source image and generation parameters; only then seek authorization for video generation.
5. Integrate approved video while preserving fallbacks and pause control.
6. Independently review, then obtain explicit authorization before merge or public deployment.

---

**Document purpose:** Instructions for Claude and ChatGPT, not authorization to modify, publish, generate paid media, or merge any project.
