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
4. **No lettering in the art.** Image models misspell and mangle type. The title is added afterwards as real type in Bricolage Grotesque ExtraBold (the site's display font since the 2026-11 redesign), so it is crisp and spelled right. Each prompt leaves space for it.
5. Save the image you choose with its prompt (copy the final prompt and any follow-ups) and hand both to Claude. Claude adds the provenance line, sizes it, and runs the checks.

Shared style line, already inside every prompt below: *painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings unless named, no text, no logos, no user interface, no borders.*

Palette, for reference (website redesign, 2026-11): night pine `#102019`, moss `#172c23`, paper `#f3ecda`, cream `#fbf6e7`, and one soft accent, fern `#b7d494`, used for everything you can press. Each landscape has its own colour (`[data-map]` in `website/site.css`, `[data-land]` in `guide.css`). The painted art itself can stay warm and golden; the sprout green belongs to type and buttons laid over it, so keep it out of the paintings.

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

Used for: the itch.io cover image (630 × 500 there is also fine; Claude can crop it), and a future Steam page (small capsule 462 × 174 and main capsule 616 × 353 there). The title is added by Claude in Bricolage Grotesque; the art needs a clear area for it.

**Source capture:** `website/review-media/landscape-pnw.jpg` (bull elk in the autumn rut). **Final sizes:** 460 × 215 and 616 × 353 (both about 2:1 and 7:4; ask for the wide shape and keep the subject in the right half).

> Using the attached screenshot from my game as the reference for the animals, paint a small store banner for a nature game called "Second Growth". A single bull Roosevelt elk in an autumn meadow, head raised mid-bugle, breath visible in cool morning air, on the right half of the frame. Behind it a restored valley: golden grass, young trees, a glint of a creek, dark conifer hills. The left 45% of the frame is quiet, softly lit meadow and mist, with nothing important in it, so a title can be placed there. It must read clearly at a tiny size: one strong subject, strong silhouette, simple background, high contrast between the elk and the sky. Style: painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings, no text, no logos, no user interface, no borders. Wide format.

Alternative subject for variety (attach `website/review-media/landscape-sumatra.jpg`): a Sumatran orangutan in a fruiting tree in restored rainforest, same layout.

Site label (if shown in the press kit): "Illustration · store capsule".

## 3. Social card: 1200 × 630

Used for: posts linking to the site, devlog posts and the press kit's download. The homepage's own share image (`share.jpg`) stays the real hero crop; this card is for posts where art reads better than a screenshot.

**Source capture:** `website/review-media/creek-later.jpg` (the same creek two game years after planting). Also attach `website/review-media/creek-before.jpg` if you try the split version. **Final size:** 1200 × 630 (ask for the wide shape).

> Using the attached screenshots from my game as the reference for the place, paint a wide social media card for "Second Growth", a game about bringing damaged land back to life. Show the same creek valley as a soft transition from left to right: on the far left, a tired, bare pasture with a straightened ditch and a rusty culvert; blending through the middle into, on the right, a lush restored creek with young alders, redcedars, flowering meadow plants, salmon visible in clear water and a heron on the bank. The transition is gradual and natural, not a hard split line. Keep a calm horizontal band across the middle third clear enough for a short title to be laid over. Style: painterly but grounded nature illustration, soft golden-hour light, deep forest greens, cream and warm ochre, calm and hopeful, true-to-life animals and plants of this region, no people, no buildings, no text, no logos, no user interface, no borders. Wide format.

Site label: "Illustration · before and after, painted from game scenes".

## 4. Logo: the flat mark, the wordmark and a refreshed badge

Since the 2026-11 redesign the website uses a flat one-colour mark (`website/mark.svg`: the badge's young fir rising from an old stump, as a silhouette) beside the name set in Bricolage Grotesque ExtraBold. The detailed illustrated badge (`assets/logo.svg`) stays the game's app icon and the press kit's logo for now. ChatGPT is useful here for **exploring**, not for final files: image models can't set real type or draw clean vectors, so Claude rebuilds the chosen design as SVG.

**4a. A sharper mark.** Attach `assets/icon-512.png` and a screenshot of the site header.

> The attached images are my game "Second Growth": its current detailed badge (a young fir growing from an old cut stump by a creek) and my website's header, which uses a simple flat silhouette of that idea. Design 8 alternative flat logo marks for the same idea, new growth rising from old damage: a young conifer sprouting from a tree stump, seen simply. Bold geometric shapes, one colour only (soft fern green #b7d494 on a near-black green #102019 background), must read clearly at 16 pixels, no gradients, no outlines, no text, no extra scenery. Think modern indie game studio mark: calm, natural, quietly confident. Show all 8 on one sheet in a grid.

**4b. A refreshed badge / app icon.** The same idea as the current badge, in the new look, for the game's home-screen icon, itch.io and the press kit.

> Using the attached badge from my game "Second Growth" as the reference for the subject, redesign it as a modern app icon: a rounded square, a young Douglas-fir rising from an old cut stump with visible growth rings, a strip of creek, a low sun. Flat, bold shapes with at most one soft gradient, the way the best indie game app icons look today: simple enough to recognise at 48 pixels, rich enough to enjoy at 512. Palette: deep night green #102019 and moss #172c23 behind, soft fern green #b7d494 for the young tree, warm sun #ffb648, creek teal #63bdf6, stump in warm brown and cream. No text, no border, no drop shadow outside the square. Show 4 options.

**4c. Wordmark detail (optional).**

> The name "Second Growth" set in a heavy, friendly grotesque in the style of Bricolage Grotesque ExtraBold, tight letter spacing, cream #fbf6e7 on near-black green #102019. Give it one small detail drawn from the logo: a tiny fir sprouting from the dot or terminal of one letter, in fern #b7d494. Show 4 options. Spell it exactly: Second Growth.

Pick one and give it to Claude with its prompt. Claude redraws it as SVG (`website/mark.svg`, or a new badge in `assets/` if Cole wants the game's icon changed too; the badge is also the game's home-screen icon, so that is a game change), records the ChatGPT image in `art-provenance.json` as the design reference (`"use": "logo"`, `"source": null`), and updates the press kit's logo section.

## 5. Painted backdrop for the itch.io page

Used for: the itch.io page background and banner (itch lets a page have a wide background image), so the game's store page matches the website. Not the website itself.

**Source capture:** `website/review-media/landscape-amazon.jpg` and `website/review-media/header-desktop.jpg`. **Final size:** 2560 × 1440, plus a 960 × 250 banner crop.

> Using the attached screenshots from my game as the reference for the look of the plants and animals, paint a wide, dark, atmospheric backdrop for my game's store page: a restored valley at dusk seen from slightly above, layered silhouettes of conifers and broadleaf trees, a winding creek catching the last light, fireflies, a herd of elk small in the middle distance. Mostly deep night greens (#102019, #172c23) so light text reads on top of it anywhere, with a warm glow (#ffb648) low on the horizon. Calm, hopeful, true-to-life plants and animals, no people, no buildings, no text, no logos, no user interface, no borders. Wide format.

---

## After ChatGPT: what Claude does

1. Crop and resize to the exact sizes above (`sips` on the Mac, keeping the subject in frame), JPEG quality about 85, under 1.5 MB each.
2. Add each file to `website/art/` with its line in `art-provenance.json` (`shasum -a 256 website/art/<file>` for the hash).
3. Put it on the page only inside `<figure class="illustration">` captioned "Illustration · …" (the press kit gets a "Key art" section then), or as the logo.
4. Run `node tools/website-check.mjs` and `node tools/website-security-check.mjs`, and look at each image on the page at desktop, 844 × 390 and 375 × 812.
