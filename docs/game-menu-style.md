# Startup selector and bright glass UI

Status: approved for publication on October 17, 2026.

Cole requested current website keystone images in the game selector, then expanded the glass treatment to the initial selector and gameplay HUD. The accepted direction is brighter sage glass with dark readable labels, rather than dark green panels. Simulation rules and save formats are unchanged.

## Startup and save boundaries

On an ordinary load, `main.js` prepares saved-map metadata and the paused render scene, then opens the existing map/mode picker directly. It does not open the story screen first. The HUD is hidden by `choosing-map` until Start or Continue; map generation still happens to supply the backdrop, but no simulation progression or automatic saving is permitted before choosing. How to Play retains the regional story and instructions in the menu. Pending map switches and resumes keep their existing reload path.

`UI.modal` accepts `dismissible: false` for the initial picker. Escape and backdrop clicks cannot enter an unchosen farm; the close button is hidden. Actual mode/Continue actions explicitly close it. Other game dialogs retain normal dismissal. Startup checks existing-save metadata so starting over still requires the replacement confirmation. A failed startup resume returns to the selector with the farm paused and the old save preserved. `UI.setSpeed` ends the initial selection state after an explicit start/resume action.

## Images

The seven files in `assets/maps/` mirror approved `website/review-media/landscape-*.jpg` captures byte-for-byte. Staging and hashes are recorded in website capture provenance and `docs/website-review.md`. Map definitions retain their existing paths, supporting the root game, packaged `/play/` and itch.io. The picker adds a capture-version query, image dimensions and alt text, and centres each full 3:2 scene. Copy a new approved capture and bump its query version when replacing it. Width/height attributes require CSS `height: auto` alongside `aspect-ratio`, otherwise the HTML height can make a thumbnail excessively tall.

## Materials and performance

Updated October 18, 2026: Cole asked for clearer, more modern glass. Yesterday's "every dialog is glass" change had raised the menus to about 87% opacity, because the HUD showed through them, so they had stopped looking like glass.

All the glass lives in tokens at the top of the panel section of `styles.css`. `--glass` is a near-white surface with a hint of sage (44% on the HUD, 50% on dialogs). `--glass-dense` (62%) is for text-heavy panels: tools, inspector, quest and legend. `--glass-solid` (94%) is used wherever nothing is blurred behind. Each surface has a hairline white edge, a top highlight and a soft lifted shadow. The blur saturates the land behind it instead of greying it: 14 px with 1.4× saturation on the HUD, and 32 px with 1.3× on dialogs, which stay lower because a barn or ploughed field would otherwise tint a large panel. Inside the glass, the `--paper` tokens are remapped to white fills (`--fill`, `--fill-hover`) with white hairlines, so cards and controls no longer stack tinted boxes. Buttons, the speed control and segmented controls are pills, primary buttons are moss, the close button is a round chip, and settings rows are separate white cards. Toasts are dark glass, and their icon carries the kind, not a coloured left bar.

While a dialog is open, the HUD fades away (`body:has(#modal-root .modal-back) .panel`). That lets the dialog stay clear without the HUD smearing through, and the HUD's blur isn't drawn under it. The startup selector already hid the HUD with `choosing-map`.

Blur is limited to where it's cheap. On Fast (`menu-effects-off`), the HUD, dialogs and toasts use solid fallbacks with no filter. Touch screens skip the HUD blur, which covers several surfaces over a moving scene, but dialogs now blur there too, since each is a single surface. Reduced-transparency and greater-contrast preferences request solid surfaces. Nothing in the glass is animated and there are no nested blurs. The GPU cost of the stronger HUD blur on the low-end target (Intel HD 520, decision 0004) hasn't been measured. If it shows up, lower `--glass-blur` before changing anything else. The loading-screen card uses the same flat material without blur.

## Discoverable camera rotation

The sage camera controls are visible on desktop, with Q/E labels and accessible shortcut/tooltips. Buttons and Q/E nudge 15° in either direction; Shift-click and Shift+Q/E turn 90°. Fine keyboard nudges may repeat, while Shift quarter-turns ignore key-repeat to avoid queuing many large turns. The renderer's existing `rotate(dir)` API still defaults to 90° for compatibility; UI and input pass their chosen degree step explicitly. Existing angle easing, camera math and simulation state are reused.

The controls move clear of an open inspector or desktop overlay legend and sit above the minimap's toggle. Short-screen positioning handles expanded and folded minimaps. Touch buttons remain 44 px and omit keyboard labels. The startup selector, cinematics and photo mode retain their existing control visibility rules. Keyboard rotation still respects modal, text-entry and operating-system shortcut guards.

Verification used actual browser key events and Shift-clicks, checked 15°/90° target changes, default renderer compatibility, modal guards, and non-overlap with the minimap, tools, inspector and legend at 1440×900, 1024×768 and 667×375. Touch checks covered 44 px targets, hidden key labels and finer button turns. Website packaging and inline-script CSP hashes continue to pass. No balance or simulation behavior changed.

## Phone Home Screen guidance

The portrait rotate screen includes platform-specific Home Screen guidance. `js/ui/mobile-install.js` runs independently of the simulation so the note is available while the game loads. iOS (including touch iPads using a desktop user agent) gets Safari Share / Add to Home Screen steps; Android gets Chrome menu / install steps. Other platforms receive the original rotate prompt. `navigator.standalone` and display-mode CSS hide installation guidance inside installed apps, while keeping rotation guidance. The card uses the existing Spanish translation mechanism. Portrait content scrolls on short screens and respects safe-area insets. These are installation instructions, not an offline-mode or frame-rate guarantee.

Browser wording follows [Apple's Home Screen guide](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios) and [Chrome's Android web-app guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en), checked October 17, 2026; labels differ across browser versions.

## Verification

Notifications have individual dismiss buttons; closing a location-linked notification does not move the camera. Settings → Gameplay → Notifications → Hide pop-ups clears current pop-ups and suppresses new ones while continuing to journal every update. This preference lives in browser settings, separately from farms. Fire/flood banners dismiss per active event, rather than per tile-count change; an ended event, a fresh event signal or a new farm resets dismissal. Hiding pop-ups does not disable hazard banners, automatic pause preferences or simulation events. Touch dismiss targets are 44 px.

`node tools/website-check.mjs` validates the assembled website and exact game packaging. `nice -n 15 node tools/browser-save-check.mjs` covers startup non-dismissal, Continue, manual save/retry, recovery, map switching and persistence. Visual interaction checks cover all seven image selections, desktop and landscape-phone controls, keyboard activation, scrolling, inspectors, tool selection, settings and language, and Fast/touch/accessibility materials.

Use isolated browser storage and throttle rendering. Seed preferences before navigating, and enable CDP Page events before registering startup scripts. Inspect effective Detail because an automatic switch to Fast legitimately removes blur. The loading-screen element is removed after startup, so readiness accepts its done state or absence after `window.secondGrowth` exists. Close/delete only the test browser afterward; preserve Cole's existing preview tab and server.
