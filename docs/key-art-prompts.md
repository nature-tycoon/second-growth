# Key art and logo: ChatGPT prompt pack

Step 4 of the [website plan](website-plan-2026-11.md). Claude can't run ChatGPT, so this is the hand-off: Cole pastes a prompt into ChatGPT with the named game capture attached, picks the best result, and gives it back to Claude to size, check and add to the site.

## The one rule

Anything the site shows as **a scene from the game** stays a real capture (`website/review-media/`). Everything made here is **art**, not a game scene, and the site labels it that way:

- It goes in `website/art/`, with a line in `website/art/art-provenance.json` (tool, prompt, source image, date, hash). `tools/build-website.mjs` publishes only art listed there.
- On a page it sits in `<figure class="illustration">` with a caption starting "Illustration". A logo or wordmark may also appear on its own (header, press kit), where nobody reads it as gameplay.
- It is never put in `review-media/`, never used as the homepage hero, a video poster or the `share.jpg` crop. `node tools/website-check.mjs` fails if any of that slips.
- Off the site (itch.io page, a store capsule, a social post) the same art should still not be passed off as a screenshot: say "key art" or keep it obviously painted.

## How to run a prompt

1. Open ChatGPT, start a new chat, attach the **source capture** named in the prompt (the file is in the repo; the URL works too once the site is live, e.g. `https://secondgrowth.earth/review-media/header-desktop.jpg`).
2. Paste the prompt as written. Ask for a few variations; follow up in plain words ("warmer light", "less busy on the left so the title fits").
3. ChatGPT makes images in a few fixed shapes (square, wide 3:2, tall 2:3), not exact pixel sizes. Pick the shape the prompt says; Claude crops and resizes to the exact size afterwards and keeps the important part in frame.
4. **No lettering in the art.** Image models misspell and mangle type. The title is added afterwards as real type in Fraunces (the site's font), so it is crisp and spelled right. Each prompt leaves space for it.
5. Save the image you choose with its prompt (copy the final prompt and any follow-ups) and hand both to Claude. Claude adds the provenance line, sizes it, and runs the checks.

Shared style line, already inside every prompt below: *painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings unless named, no text, no logos, no user interface, no borders.*

Palette, for reference: forest `#173a30`, deep `#112d26`, cream `#ece7cf`, sage `#c3cdad`, leaf `#a9be89`, ochre `#cba873`.

---

## 1. Hero key art, wide (16:9) and upright (9:16)

Used for: the itch.io banner and cover, a wallpaper, the trailer's title card, the press kit's art section. Not the homepage hero (that stays game footage).

**Source capture:** `website/review-media/header-desktop.jpg` (restored Hollis creek with elk, deer, beaver and heron). For the upright one also attach `website/review-media/header-mobile.jpg`.
**Final sizes:** 3840 × 2160 (16:9) and 2160 × 3840 (9:16). Ask ChatGPT for the wide shape, then the tall one.

> Using the attached screenshot from my game as the reference for the place, the animals and the composition, paint key art for "Second Growth", a game about restoring damaged land. Scene: a restored salmon creek in a Pacific Northwest foothill valley at golden hour. Roosevelt elk wading at the creek edge, a black-tailed deer at the tree line, a great blue heron lifting off the water, a beaver's lodge in the shallows. Young alders and redcedars along the banks, an old cut stump in the foreground with a young fir growing from it (the game's emblem: new growth from old damage). Gentle mist over the water, far hills with dark conifers. Keep the animals' proportions and markings true to life and to the reference. Leave calm, open sky or mist in the upper third so a title can sit there. Style: painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings, no text, no logos, no user interface, no borders. Wide landscape format.

Follow-up for the upright version:

> Now the same scene re-composed for a tall phone screen (9:16): the stump and young fir low in the frame, the elk and creek in the middle, the heron and open sky in the top third for a title. Same style and light.

Site label: "Illustration · key art, painted from a game scene".

## 2. Store capsules: 460 × 215 and 616 × 353

Used for: the itch.io cover image (630 × 500 there is also fine; Claude can crop it), and a future Steam page (small capsule 462 × 174 and main capsule 616 × 353 there). The title is added by Claude in Fraunces; the art needs a clear area for it.

**Source capture:** `website/review-media/landscape-pnw.jpg` (bull elk in the autumn rut). **Final sizes:** 460 × 215 and 616 × 353 (both about 2:1 and 7:4; ask for the wide shape and keep the subject in the right half).

> Using the attached screenshot from my game as the reference for the animals, paint a small store banner for a nature game called "Second Growth". A single bull Roosevelt elk in an autumn meadow, head raised mid-bugle, breath visible in cool morning air, on the right half of the frame. Behind it a restored valley: golden grass, young trees, a glint of a creek, dark conifer hills. The left 45% of the frame is quiet, softly lit meadow and mist, with nothing important in it, so a title can be placed there. It must read clearly at a tiny size: one strong subject, strong silhouette, simple background, high contrast between the elk and the sky. Style: painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings, no text, no logos, no user interface, no borders. Wide format.

Alternative subject for variety (attach `website/review-media/landscape-sumatra.jpg`): a Sumatran orangutan in a fruiting tree in restored rainforest, same layout.

Site label (if shown in the press kit): "Illustration · store capsule".

## 3. Social card: 1200 × 630

Used for: posts linking to the site, devlog posts and the press kit's download. The homepage's own share image (`share.jpg`) stays the real hero crop; this card is for posts where art reads better than a screenshot.

**Source capture:** `website/review-media/creek-later.jpg` (the same creek two game years after planting). Also attach `website/review-media/creek-before.jpg` if you try the split version. **Final size:** 1200 × 630 (ask for the wide shape).

> Using the attached screenshots from my game as the reference for the place, paint a wide social media card for "Second Growth", a game about bringing damaged land back to life. Show the same creek valley as a soft transition from left to right: on the far left, a tired, bare pasture with a straightened ditch and a rusty culvert; blending through the middle into, on the right, a lush restored creek with young alders, redcedars, flowering meadow plants, salmon visible in clear water and a heron on the bank. The transition is gradual and natural, not a hard split line. Keep a calm horizontal band across the middle third clear enough for a short title to be laid over. Style: painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings, no text, no logos, no user interface, no borders. Wide format.

Site label: "Illustration · before and after, painted from game scenes".

## 4. Logo lockup and wordmark

Used for: the site header, the press kit's logo pack, the itch.io page, the trailer's end card.

The badge stays the existing one (`assets/logo.svg`: a young fir growing from an old stump by a creek, in a cream-ringed green disc). The lockup sets the name beside or under it. Image models can't set real type reliably, so use ChatGPT to **explore the layout and lettering style**, and Claude rebuilds the chosen design as a clean SVG in Fraunces, so it stays sharp at every size.

**Source:** `assets/icon-512.png` (the badge as a picture; attach it). No game capture (the provenance line records `"source": null`, allowed only for a logo or wordmark). **Final files:** `logo-lockup-horizontal.svg` (about 4:1), `logo-lockup-stacked.svg` (about 1:1.2), `wordmark.svg`, each also as a PNG at 2000 px wide, on transparent, cream and forest-green backgrounds.

> The attached image is the badge logo of my game "Second Growth" (a young fir growing from an old stump by a creek). Design logo lockups that combine this exact badge, unchanged, with the words "Second Growth". Show 6 options on one sheet on a plain cream background: 3 horizontal (badge left, name right) and 3 stacked (badge above, name below). Lettering: an elegant soft-serif typeface in the style of Fraunces (warm, slightly old-style, high contrast, gentle curves), in deep forest green #173a30, with an optional thin ochre #cba873 rule or small leaf accent. Keep it simple and calm, readable at small sizes, no extra illustrations, no tagline, no mock-ups or 3D effects. Spell the name exactly: Second Growth.

Follow-up for the wordmark on its own:

> Now the name "Second Growth" alone as a wordmark, in the same lettering, with one small detail drawn from the badge (for example a tiny sprouting fir rising from the S, or a leaf on the G). Show 4 options, deep forest green on cream. Spell it exactly: Second Growth.

Pick one and give it to Claude: Claude sets it in Fraunces as SVG (with the badge from `assets/logo.svg`) and adds the files to the press kit's logo section. Record the ChatGPT image in `art-provenance.json` as the design reference (`"use": "logo"`), with the final SVGs alongside.

---

## After ChatGPT: what Claude does

1. Crop and resize to the exact sizes above (`sips` on the Mac, keeping the subject in frame), JPEG quality about 85, under 1.5 MB each.
2. Add each file to `website/art/` with its line in `art-provenance.json` (`shasum -a 256 website/art/<file>` for the hash).
3. Put it on the page only inside `<figure class="illustration">` captioned "Illustration · …" (the press kit gets a "Key art" section then), or as the logo.
4. Run `node tools/website-check.mjs` and `node tools/website-security-check.mjs`, and look at each image on the page at desktop, 844 × 390 and 375 × 812.
