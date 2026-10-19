// The scripted Hollis (PNW) restoration that balance-sim and succession-check run in `restore` mode.
// It was written for the original 80x60 farm; coordinates scale up to the real map.
//   const plan = hollisRestorePlan(game, ToolActions);  ...each day: plan.day(d) before dailyTick
export function hollisRestorePlan(g, ToolActions) {
  const w = g.world;
  const SC = w.w / 80;
  // The restoration plan batches edits; dailyTick refreshes the environment afterward.
  const actions = new ToolActions(g, { refreshEnvironment: false });
  const useRaw = (key, x, y, radius = 1) => {
    const stroke = actions.begin(key);
    actions.paint(stroke, x, y, radius);
    return actions.end(stroke).count;
  };
  const use = (key, x, y, r=1) => useRaw(key, Math.round(x * SC), Math.round(y * SC), Math.max(r, Math.round(r * SC)));
  const rect = (key,x0,y0,x1,y1,step=1,r=0) => { let n=0; const S = v => Math.round(v * SC); for (let y=S(y0);y<=S(y1);y+=step) for (let x=S(x0);x<=S(x1);x+=step) n+=useRaw(key,x,y,r); return n; };
  function restoreYear1() {
    use('demolish', 36, 50);
    for (let x=0;x<w.w;x++) useRaw('demolish', x, 0);
    for (let y=0;y<w.h;y++) useRaw('demolish', w.w-1, y);
    // pull invasives near creek
    for (let y=1;y<56;y++) for (let x=33;x<=49;x++) use('pull',x,y,0);
    // riparian shrubs & pioneer trees along creek
    for (let y=2;y<55;y+=1) { use('mix_riparian',35,y,1); use('mix_riparian',37,y,1); use('mix_riparian',45,Math.min(y,30),1); use('mix_riparian',47,Math.min(y,30),1);}
    for (let y=2;y<55;y+=3) { use('mix_pioneer',34,y,0); use('mix_pioneer',38,y,0); if (y<30){use('mix_pioneer',44,y,0);use('mix_pioneer',48,y,0);} }
    // marsh by ditch
    rect('marsh', 38, 38, 43, 43);
    rect('mix_wet', 37,37,44,44);
    // field A meadow
    rect('rip', 4, 27, 30, 45);
    rect('mix_meadow', 4, 27, 30, 45);
  }
  function visitorsYear2() {
    // trailhead on the farm lane, a trail down to the creek and along the marsh
    useRaw('build_parking', 45, 28);
    for (let x = 47; x <= 52; x++) useRaw('trail', x, 29, 0);
    for (let y = 29; y <= 66; y++) useRaw('trail', 52, y, 0);
    for (let x = 52; x <= 75; x++) useRaw('trail', x, 67, 0);
    useRaw('blind', 58, 68);
  }
  function restoreYear2() {
    visitorsYear2();
    rect('rip', 51,3,76,15); rect('mix_pioneer',51,3,76,15,2); rect('mix_conifer',52,4,76,15,3);
    rect('pull',0,0,79,55);
    use('snag',40,36); use('snag',44,44); use('log',40,40); use('log',41,41); use('nestbox',39,37);
    use('intro_beaver', 36, 40);
  }
  function restoreYear3() {
    rect('rip', 40,35,76,51); rect('mix_meadow', 40,35,60,51); rect('mix_upland',60,35,76,51,2); rect('mix_pioneer',62,36,76,51,3);
    rect('mix_understory', 51,3,76,15,2);
  }
  // d: days since the start, called before that day's dailyTick
  return { day(d) { if (d===5) restoreYear1(); if (d===125) restoreYear2(); if (d===245) restoreYear3(); } };
}
