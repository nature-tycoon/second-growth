import { createWatershedFixture } from './watershed-fixtures.mjs';
import { WatershedView } from '../js/render3d/watershed-view.js';

const ids = ['fixture', 'view', 'play', 'step', 'rotate', 'clock', 'surface', 'wet', 'discharge', 'description', 'places', 'inspect',
  'rain', 'inflow', 'evaporation', 'infiltration', 'speed', 'storm', 'dry', 'dam', 'reset', 'notice', 'legend'];
const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
let fixture, w, running = true, selected = null, stormUntil = 0, stormPrevious = null, history = [], discharge = 0, lastOut = 0;
const view = new WatershedView(document.getElementById('landscape'), i => { selected = i; inspect(); });
const sum = values => values.reduce((a, b) => a + b, 0);
const format = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
function controls() {
  document.getElementById('rain-value').textContent = Number(ui.rain.value).toFixed(3) + ' / day';
  document.getElementById('inflow-value').textContent = Number(ui.inflow.value).toFixed(1) + '×';
  document.getElementById('evaporation-value').textContent = Number(ui.evaporation.value).toFixed(3) + ' / day';
  document.getElementById('infiltration-value').textContent = Number(ui.infiltration.value).toFixed(1) + '×';
  document.getElementById('speed-value').textContent = Number(ui.speed.value).toFixed(1) + ' days / sec';
}
function inspect() {
  if (selected === null) return;
  const i = selected, x = i % w.width, y = Math.floor(i / w.width);
  const place = fixture.places.find(p => p.x === x && p.y === y);
  const depth = w.surface[i], saturated = w.soil[i] / w.capacity[i];
  const state = depth > .2 ? 'Standing or flowing water' : depth > .004 ? 'Shallow water' : saturated > .8 ? 'Saturated ground' : 'Dry surface';
  ui.inspect.innerHTML = `<b>${place?.name || `Cell ${x}, ${y}`} · ${state}</b><span>Water depth ${depth.toFixed(3)} · soil ${(saturated * 100).toFixed(0)}% full · groundwater ${w.groundwater[i].toFixed(3)}<br>Ground elevation ${w.bed[i].toFixed(3)} · water surface ${(w.bed[i] + depth).toFixed(3)} · local flow ${Math.hypot(w.flowX[i], w.flowY[i]).toFixed(3)} / day</span>`;
  view.select(i);
}
function chart() {
  const canvas = document.getElementById('history'), ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (history.length < 2) return;
  const max = Math.max(1, ...history.flatMap(row => row.slice(1))), span = Math.max(20, history.at(-1)[0] - history[0][0]);
  ctx.strokeStyle = '#d7e0d2'; ctx.lineWidth = 1;
  for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(0, height * k / 4); ctx.lineTo(width, height * k / 4); ctx.stroke(); }
  for (const [index, color] of [[1, '#328da5'], [2, '#97835b'], [3, '#7388a0']]) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 3;
    history.forEach((row, i) => {
      const x = (row[0] - history[0][0]) / span * width, y = height - 6 - row[index] / max * (height - 12);
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }); ctx.stroke();
  }
}
function refresh() {
  const balance = w.balance(); ui.clock.textContent = `Day ${w.day.toFixed(1)}`;
  ui.surface.textContent = format(sum(w.surface)); ui.wet.textContent = w.surface.filter(v => v > .004).length;
  ui.discharge.textContent = format(discharge);
  for (const key of ['initial', 'rain', 'inflow', 'evaporation', 'plantUse', 'outflow', 'stored']) document.getElementById(key + '-budget').textContent = format(balance[key]);
  const error = document.getElementById('error-budget'); error.textContent = Math.abs(balance.error) < 1e-6 ? '< 0.000001' : balance.error.toExponential(2);
  error.className = Math.abs(balance.error) < 1e-6 ? 'ok' : 'bad';
  if (stormUntil > w.day) ui.notice.textContent = `Storm active · ${(stormUntil - w.day).toFixed(1)} days remaining. Watch the basin and floodplain fill.`;
  view.update(); inspect(); chart();
}
function reset() {
  ui.rain.value = '.002'; ui.inflow.value = '1'; ui.evaporation.value = '.006'; ui.infiltration.value = '1';
  fixture = createWatershedFixture(ui.fixture.value); w = fixture.w; selected = null;
  stormUntil = 0; stormPrevious = null; lastOut = discharge = 0;
  history = [[0, sum(w.surface), sum(w.soil), sum(w.groundwater)]];
  ui.description.textContent = fixture.description; ui.places.replaceChildren();
  for (const place of fixture.places) {
    const button = document.createElement('button'); button.textContent = place.name;
    button.onclick = () => { selected = place.y * w.width + place.x; inspect(); }; ui.places.appendChild(button);
  }
  ui.dam.disabled = !fixture.damEdges.length; ui.dam.textContent = 'Place test dam';
  ui.notice.textContent = fixture.id === 'valley' ? 'The creek is supplied by upstream water. The isolated basin starts empty.' : 'The oxbow already exists. Try a storm to raise water across its seasonal connection.';
  ui.inspect.innerHTML = '<b>Explore the landscape</b><span>Point at a cell or choose a landmark to inspect its water.</span>';
  view.setFixture(fixture); controls(); refresh();
}
function advance(days) {
  // Split precisely at a storm's end, so pulse duration does not depend on speed.
  const duration = stormUntil > w.day ? Math.min(days, stormUntil - w.day) : days;
  w.step(duration, { rain: Number(ui.rain.value), evaporation: Number(ui.evaporation.value), plantUse: .004,
    sourceScale: Number(ui.inflow.value), infiltrationScale: Number(ui.infiltration.value) });
  discharge = (w.budget.outflow - lastOut) / duration; lastOut = w.budget.outflow;
  if (stormUntil && w.day >= stormUntil - 1e-9) {
    stormUntil = 0; ui.rain.value = stormPrevious.rain; ui.inflow.value = stormPrevious.inflow; ui.evaporation.value = stormPrevious.evaporation;
    stormPrevious = null; ui.notice.textContent = 'The storm has passed. Water continues moving and stored water drains gradually.'; controls();
  }
  if (days > duration + 1e-9) advance(days - duration);
  if (w.day - history.at(-1)[0] >= .5) {
    history.push([w.day, sum(w.surface), sum(w.soil), sum(w.groundwater)]); if (history.length > 240) history.shift();
  }
}
ui.play.onclick = () => { running = !running; ui.play.textContent = running ? 'Pause' : 'Run'; };
ui.step.onclick = () => { running = false; ui.play.textContent = 'Run'; advance(1); refresh(); };
ui.fixture.onchange = reset; ui.reset.onclick = reset;
ui.view.onchange = () => {
  view.mode = ui.view.value; view.resize();
  ui.legend.innerHTML = view.mode === 'moisture' ? 'Dry soil <i style="background:linear-gradient(90deg,#c3a76b,#377ca1)"></i> Saturated soil' : view.mode === 'flow' ? 'Arrows follow simulated flow · near top-down view' : 'Shallows <i></i> Deep water · scroll to zoom'; refresh();
};
ui.rotate.onclick = () => { view.angle += Math.PI / 2; view.resize(); };
for (const id of ['rain', 'inflow', 'evaporation', 'infiltration', 'speed']) ui[id].oninput = () => {
  if (stormUntil && ['rain', 'inflow', 'evaporation'].includes(id)) { stormUntil = 0; stormPrevious = null; ui.notice.textContent = 'Weather adjusted manually; the storm pulse has ended.'; }
  controls();
};
ui.storm.onclick = () => {
  if (!stormPrevious) stormPrevious = { rain: ui.rain.value, inflow: ui.inflow.value, evaporation: ui.evaporation.value };
  ui.rain.value = '.05'; ui.inflow.value = '5'; ui.evaporation.value = '.002'; stormUntil = w.day + 12;
  running = true; ui.play.textContent = 'Pause'; controls(); refresh();
};
ui.dry.onclick = () => {
  stormUntil = 0; stormPrevious = null; ui.rain.value = '0'; ui.inflow.value = '0'; ui.evaporation.value = '.02';
  ui.notice.textContent = 'Dry spell: no rainfall or upstream inflow. Surface water evaporates and groundwater continues returning slowly.';
  controls();
};
ui.dam.onclick = () => {
  const remove = w.barriers.size > 0;
  for (const edge of fixture.damEdges) {
    if (remove) w.removeBarrier(edge.a, edge.b); else w.setBarrier(edge.a, edge.b, edge.crest, .015);
  }
  ui.dam.textContent = remove ? 'Place test dam' : 'Remove test dam';
  ui.notice.textContent = remove ? 'The test dam is removed. Stored upstream water can drain through the crossing.' : 'The test dam slows the creek. Upstream water can pool, seep through, or overtop its crest.'; refresh();
};
reset();
let last = null, accumulated = 0, lastRefresh = 0;
function frame(now) {
  if (last !== null && running && !document.hidden) accumulated += Math.min((now - last) / 1000, .1) * Number(ui.speed.value);
  last = now;
  let steps = 0;
  while (accumulated >= .25 && steps < 4) { advance(.25); accumulated -= .25; steps++; }
  if (steps && now - lastRefresh > 100) { refresh(); lastRefresh = now; }
  view.render(now / 1000); requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { last = null; accumulated = 0; });
requestAnimationFrame(frame);
