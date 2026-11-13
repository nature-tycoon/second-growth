# Key art and logo: ChatGPT prompt pack

Step 4 of the [website plan](website-plan-2026-11.md). Claude can't run ChatGPT, so this is the hand-off: Cole pastes a prompt into ChatGPT with the named game capture attached, picks the best result, and gives it back to Claude to size, check and add. Updated 2026-11-13 for the calm redesign and the six-clip reel.

## Start here

If you only do two things, do these:

1. **[Hero key art](#1-hero-key-art-wide-169-and-upright-916)** (section 1): the one picture that stands for the game on itch.io, in the press kit and as a title card.
2. **[The landscape series](#2-the-landscape-series-one-per-map)** (section 2): one picture per landscape, so posts and the store page show all seven places, not only the Pacific Northwest.

For each: open a new ChatGPT chat, attach the image named under **Attach**, paste the prompt (the grey block) exactly, and ask for 3 or 4 versions. Then send Claude the one you like plus the prompt you used.

## The one rule

Anything shown as **a scene from the game** stays a real capture (`website/review-media/`). Everything made here is **art**, and is labelled that way:

- It goes in `website/art/`, with a line in `website/art/art-provenance.json` (tool, prompt, source image, date, hash). `tools/build-website.mjs` publishes only art listed there.
- On a page it sits in `<figure class="illustration">` with a caption starting "Illustration". A logo or wordmark may also appear on its own (header, press kit), where nobody reads it as gameplay.
- It is never put in `review-media/`, never used as the homepage hero, a video poster or the `share.jpg` crop. `node tools/website-check.mjs` fails if any of that slips.
- Off the site (itch.io, a store capsule, a social post) it is still not passed off as a screenshot: call it "key art".

## Tips for ChatGPT

- ChatGPT makes a few fixed shapes (square, wide 3:2, tall 2:3), not exact pixel sizes. Ask for the shape the prompt names; Claude crops to the exact size afterwards.
- **No lettering in the art.** Image models misspell and mangle type. The title is added afterwards as real type, so it is crisp and spelled right; every prompt leaves room for it.
- Follow up in plain words: "warmer light", "the elk smaller", "less busy on the left so a title fits", "closer to the look of the screenshot".
- If an animal comes out wrong (extra legs, wrong markings, a lion with a mane on a lioness), say exactly what is wrong and ask again; don't accept it, because people who love animals notice.

## The look (already written into every prompt)

The game's art is soft and rounded: low-poly animals with clean, simple shapes, trees with puffy rounded crowns, gently shaded ground, warm light, nothing gritty. Key art should look like **the game at its most beautiful**, not a different painting style, or it will feel like a different game next to the footage. So every prompt carries this style line:

> *Style: a polished, cinematic version of the attached game's own look: soft stylised low-poly forms, rounded tree crowns, clean simple shapes, gentle shading, warm natural light with soft shadows, a little atmospheric haze for depth. Calm, hopeful and true to nature: real species with correct proportions and markings. No people, no buildings unless named, no text, no logos, no user interface, no borders.*

Palette for anything laid over the art (the website, 2026-11): night pine `#102019`, moss `#1b3128`, paper `#f3ecda`, cream `#fbf6e7`, and one soft accent, fern `#b7d494`. The paintings themselves take their colour from their landscape and light; keep the fern green for type and buttons on top. Titles are set in **Bricolage Grotesque** at a medium weight, cream on dark, as on the site.

---

## 1. Hero key art, wide (16:9) and upright (9:16)

**Used for:** the itch.io banner and cover, a wallpaper, a trailer title card, the press kit. Not the homepage hero (that stays game footage).
**Attach:** `website/review-media/header-desktop.jpg` (the restored Hollis creek with elk, deer, beaver and heron). For the upright one, also `website/review-media/header-mobile.jpg`.
**Ask for:** the wide shape first, then the tall one. **Final sizes:** 3840 × 2160 and 2160 × 3840.

> Using the attached screenshot from my game "Second Growth" as the reference for the place, the animals and the art style, create key art for the game: a restored salmon creek in a Pacific Northwest foothill valley at golden hour. Roosevelt elk wading at the creek's edge, a black-tailed deer at the tree line, a great blue heron lifting off the water, a beaver's lodge in the shallows. Young alders and western redcedars along the banks; in the foreground an old cut stump with a young Douglas-fir growing out of it (the game's emblem: new growth from old damage). Soft mist over the water, far hills of dark conifers. Keep the animals' proportions and markings true to life and to the reference. Leave calm open sky or mist across the top third so a title can sit there. Style: a polished, cinematic version of the attached game's own look: soft stylised low-poly forms, rounded tree crowns, clean simple shapes, gentle shading, warm natural light with soft shadows, a little atmospheric haze for depth. Calm, hopeful and true to nature: real species with correct proportions and markings. No people, no buildings, no text, no logos, no user interface, no borders. Wide landscape format.

Follow-up for the upright version:

> Now the same scene recomposed for a tall phone screen (9:16): the stump and young fir low in the frame, the elk and the creek in the middle, the heron and open sky in the top third for a title. Same style and light.

Site label: "Illustration · key art, made from a game scene".

## 2. The landscape series (one per map)

**Used for:** social posts, the itch.io screenshot gallery's lead image, the press kit, and a future "seven places" banner. One picture per landscape, all composed the same way so they sit together as a set: the landscape's signature animal in the right two thirds, a calm open area on the left for the place name.
**Attach:** the capture named for each. **Ask for:** the wide shape. **Final size:** 1920 × 1080 each (Claude crops; a square 1080 × 1080 crop for social posts comes from the same image).

Paste the **shared opening**, then the line for one landscape, then the **shared ending**, as one message.

Shared opening:

> Using the attached screenshot from my game "Second Growth" as the reference for the place, the animals and the art style, create one picture in a series of seven, one for each landscape in the game. Composition for the whole series: the scene's animals in the right two thirds of the frame, and a calm, uncluttered area on the left third (open sky, water, mist or soft ground) where the place name will be added later. The scene:

One line per landscape:

| Landscape | Attach | Scene line |
|---|---|---|
| Pacific Northwest | `website/review-media/landscape-pnw.jpg` | Two bull Roosevelt elk facing each other in an autumn meadow at dawn, antlers lowered, breath steaming in the cold air; cows grazing behind them; golden grass, young trees turning orange, dark conifer hills. |
| Serengeti | `website/review-media/video/hunt-lions.jpg` | Two lionesses crouched low in tall golden grass at dusk, watching a herd of wildebeest grazing in the distance; a lone umbrella thorn tree; a wide, warm, hazy sky. |
| Amazon | `website/review-media/landscape-amazon.jpg` | A red-handed howler monkey feeding high in a fruiting tree in restored rainforest, a scarlet macaw flying past; layered green canopy, shafts of soft morning light through mist. |
| Atlanta | `website/review-media/landscape-atlanta.jpg` | Monarch butterflies over a native flower garden of milkweed, goldenrod and asters in a quiet suburban backyard, a red-tailed hawk circling high above; late-summer afternoon light. |
| Nicaragua | `website/review-media/landscape-chinandega.jpg` | Olive ridley sea turtle hatchlings crossing a dark-sand beach toward gentle Pacific waves at sunrise; mangroves and a green volcanic slope behind. |
| Great Barrier Reef | `website/review-media/landscape-reef.jpg` | A reef manta ray gliding over a recovering coral garden in clear turquoise water, a green sea turtle and a parrotfish nearby, sunlight rippling across the sand. |
| Sumatra | `website/review-media/landscape-sumatra.jpg` | A Sumatran orangutan resting on a branch of a fruiting tree in restored lowland rainforest, looking calmly out of the frame; tall dipterocarp crowns and soft mist behind. |

Shared ending:

> Keep the animals' proportions and markings true to life and to the reference. Style: a polished, cinematic version of the attached game's own look: soft stylised low-poly forms, rounded tree crowns, clean simple shapes, gentle shading, warm natural light with soft shadows, a little atmospheric haze for depth. Calm, hopeful and true to nature: real species with correct proportions and markings. No people, no buildings, no text, no logos, no user interface, no borders. Wide landscape format.

Do the Pacific Northwest one first. Once you like its look, start each of the others with "Match the style, light and composition of this one:" and attach the chosen Pacific Northwest picture as well, so the seven read as one set.

Site label: "Illustration · <landscape>, made from a game scene".

## 3. Store capsule

**Used for:** the itch.io cover (630 × 500) and a future Steam page (main capsule 616 × 353, small capsule 462 × 174). The title is added by Claude; the art needs a clear area for it.
**Attach:** `website/review-media/landscape-pnw.jpg` (bull elk in the rut). **Ask for:** the wide shape, subject in the right half.

> Using the attached screenshot from my game "Second Growth" as the reference for the animal and the art style, create a small store banner: a single bull Roosevelt elk in an autumn meadow, head raised mid-bugle, breath visible in cool morning air, on the right half of the frame. Behind it a restored valley: golden grass, young trees, a glint of a creek, dark conifer hills. The left 45% of the frame is quiet, softly lit meadow and mist with nothing important in it, so a title can go there. It must read at a tiny size: one strong subject, a clear silhouette, a simple background, good contrast between the elk and the sky. Style: a polished, cinematic version of the attached game's own look: soft stylised low-poly forms, rounded tree crowns, clean simple shapes, gentle shading, warm natural light with soft shadows. Calm, hopeful and true to nature. No people, no buildings, no text, no logos, no user interface, no borders. Wide format.

For a second capsule with a different place, use the same prompt with the Serengeti lionesses or the Sumatra orangutan line from section 2.

Site label (if shown in the press kit): "Illustration · store capsule".

## 4. Social card: before and after

**Used for:** posts and devlogs about restoring a place. The homepage's own share image (`share.jpg`) stays the real hero crop.
**Attach:** `website/review-media/creek-later.jpg` and `website/review-media/creek-before.jpg`. **Ask for:** the wide shape. **Final size:** 1200 × 630.

> Using the two attached screenshots from my game "Second Growth" (the same creek before and two years after restoration) as the reference for the place and the art style, create a wide picture of one creek valley that changes gently from left to right: on the far left a tired, bare pasture with a straightened ditch and a rusty culvert; through the middle it blends into, on the right, a lush restored creek with young alders and redcedars, flowering meadow plants, salmon visible in clear water and a heron on the bank. The change is gradual and natural, not a hard split line. Keep a calm horizontal band across the middle third clear enough for a short title. Style: a polished, cinematic version of the attached game's own look: soft stylised low-poly forms, rounded tree crowns, clean simple shapes, gentle shading, warm natural light with soft shadows. Calm, hopeful and true to nature. No people, no buildings, no text, no logos, no user interface, no borders. Wide format.

Site label: "Illustration · before and after, made from game scenes".

## 5. Logo: the mark, a refreshed badge, the wordmark

The website uses a flat one-colour mark (`website/mark.svg`: a young fir rising from an old stump, as a silhouette) beside the name in Bricolage Grotesque. The detailed illustrated badge (`assets/logo.svg`) is still the game's app icon and the press kit's logo. ChatGPT is for **exploring** here, not final files: image models can't set real type or draw clean vectors, so Claude redraws the chosen design as SVG.

**5a. A sharper mark.** Attach `assets/icon-512.png` and a screenshot of the site's header.

> The attached images are from my game "Second Growth": its current detailed badge (a young fir growing from an old cut stump by a creek) and my website's header, which uses a simple flat silhouette of that idea. Design 8 alternative flat logo marks for the same idea, new growth rising from old damage: a young conifer sprouting from a tree stump, seen simply. Clean geometric shapes, one colour only (soft fern green #b7d494 on a dark pine green #102019 background), readable at 16 pixels, no gradients, no outlines, no text, no extra scenery. Calm, natural and quietly confident, like the mark of a thoughtful independent nature studio. Show all 8 on one sheet in a grid.

**5b. A refreshed badge / app icon** (the game's home-screen icon, itch.io, the press kit). Attach `assets/icon-512.png`.

> Using the attached badge from my game "Second Growth" as the reference for the subject, redesign it as a modern app icon: a rounded square with a young Douglas-fir rising from an old cut stump with visible growth rings, a strip of creek and a low sun. Soft, simple shapes in the game's own gentle low-poly style, with at most one soft gradient: simple enough to recognise at 48 pixels, rich enough to enjoy at 512. Palette: dark pine green #102019 and moss #1b3128 behind, soft fern green #b7d494 for the young tree, a warm sun #e8bf7a, creek blue-green #63bdf6, the stump in warm brown and cream. No text, no border, no drop shadow outside the square. Show 4 options.

**5c. Wordmark detail (optional).**

> The name "Second Growth" set in a friendly modern grotesque in the style of Bricolage Grotesque at a medium weight, slightly tight letter spacing, cream #fbf6e7 on dark pine green #102019. Give it one small, quiet detail drawn from the logo: a tiny fir sprouting from the dot or the end of one letter, in fern #b7d494. Calm, not flashy. Show 4 options. Spell it exactly: Second Growth.

Give Claude the one you pick with its prompt. Claude redraws it as SVG (`website/mark.svg`, or a new badge in `assets/` if you want the game's icon changed too, which is a game change), records the ChatGPT image in `art-provenance.json` as the design reference (`"use": "logo"`, `"source": null`), and updates the press kit's logo section.

## 6. Backdrop for the itch.io page

**Used for:** the itch.io page background and banner, so the store page matches the website. Not the website itself.
**Attach:** `website/review-media/header-desktop.jpg` and `website/review-media/landscape-amazon.jpg`. **Final size:** 2560 × 1440, plus a 960 × 250 banner crop.

> Using the attached screenshots from my game "Second Growth" as the reference for the plants, animals and art style, create a wide, dark, atmospheric backdrop for my game's store page: a restored valley at dusk seen from slightly above, layered silhouettes of conifers and broadleaf trees with rounded crowns, a winding creek catching the last light, fireflies, a small herd of elk in the middle distance. Mostly deep pine greens (#102019, #1b3128) so light text reads on top of it anywhere, with a warm glow (#e8bf7a) low on the horizon. Soft stylised low-poly forms and gentle shading, as in the game. Calm, hopeful, true to nature. No people, no buildings, no text, no logos, no user interface, no borders. Wide format.

---

## After ChatGPT: what Claude does

1. Crop and resize to the exact sizes above (`sips` on the Mac, keeping the subject in frame), JPEG quality about 85, under 1.5 MB each.
2. Add each file to `website/art/` with its line in `art-provenance.json` (`shasum -a 256 website/art/<file>` for the hash).
3. Put it on a page only inside `<figure class="illustration">` captioned "Illustration · …" (the press kit gets a "Key art" section then), or as the logo.
4. Add titles as real type (Bricolage Grotesque, cream on dark) for any version meant for itch.io or social posts.
5. Run `node tools/website-check.mjs` and `node tools/website-security-check.mjs`, and look at each image on the page at desktop, 844 × 390 and 375 × 812.
