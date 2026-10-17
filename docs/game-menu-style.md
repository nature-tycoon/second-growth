# Startup selector and bright glass UI

Status: approved for publication on October 17, 2026.

Cole requested current website keystone images in the game selector, then expanded the glass treatment to the initial selector and gameplay HUD. The accepted direction is brighter sage glass with dark readable labels, rather than dark green panels. Simulation rules and save formats are unchanged.

## Startup and save boundaries

On an ordinary load, `main.js` prepares saved-map metadata and the paused render scene, then opens the existing map/mode picker directly. It does not open the story screen first. The HUD is hidden by `choosing-map` until Start or Continue; map generation still happens to supply the backdrop, but no simulation progression or automatic saving is permitted before choosing. How to Play retains the regional story and instructions in the menu. Pending map switches and resumes keep their existing reload path.

`UI.modal` accepts `dismissible: false` for the initial picker. Escape and backdrop clicks cannot enter an unchosen farm; the close button is hidden. Actual mode/Continue actions explicitly close it. Other game dialogs retain normal dismissal. Startup checks existing-save metadata so starting over still requires the replacement confirmation. A failed startup resume returns to the selector with the farm paused and the old save preserved. `UI.setSpeed` ends the initial selection state after an explicit start/resume action.

## Images

The seven files in `assets/maps/` mirror approved `website/review-media/landscape-*.jpg` captures byte-for-byte. Staging and hashes are recorded in website capture provenance and `docs/website-review.md`. Map definitions retain their existing paths, supporting the root game, packaged `/play/` and itch.io. The picker adds a capture-version query, image dimensions and alt text, and centres each full 3:2 scene. Copy a new approved capture and bump its query version when replacing it. Width/height attributes require CSS `height: auto` alongside `aspect-ratio`, otherwise the HTML height can make a thumbnail excessively tall.

## Materials and performance

Root palette tokens use pale sage surfaces, dark ink and clear green selection states. The existing `.panel` class gives the HUD a light translucent gradient (66% opacity), highlight border and 5 px frost, with stronger backing (84%) for tool, inspector, quest and legend text. Positions, click targets and scroll containers are reused. The startup selector, Menu and Settings share `glass-menu`, a brighter translucent surface (66–68% on supported desktop, 75–76% without blur) with one 9 px blur. Cole requested more landscape showing through after approving the sage colour; these lighter surfaces retain small backings behind HUD labels and controls. Card backings, native form controls and dense settings descriptions preserve readability. Destructive warnings remain distinctly red.

The Fast-detail body class disables menu and HUD filters while retaining bright translucency. Touch devices skip these filters too. Reduced-transparency and greater-contrast preferences request solid sage surfaces, including on Fast. No animated glass, new rendering loop or per-frame style updates are introduced. Startup/menu backdrop dimming is reduced so the scene remains visible and bright. Dense guides retain solid backgrounds using the shared light palette.

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
