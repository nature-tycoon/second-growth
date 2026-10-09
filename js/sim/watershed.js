// Experimental, renderer-independent water budget. Cell area is one; heights and
// water volumes use normalized game units, time uses game days (not SI calibration).
// Bed elevation is a flat cell floor. Internal edge fluxes are computed together
// and donor-limited before applying them, so traversal order cannot create water.
const finite = (v, name, min = 0) => {
  if (!Number.isFinite(v) || v < min) throw new RangeError(name + ' is invalid');
  return v;
};
const array = (n, value, name, min = 0) => {
  const out = typeof value === 'number' ? new Float64Array(n).fill(value) : Float64Array.from(value);
  if (out.length !== n) throw new RangeError(name + ' has the wrong length');
  for (const v of out) finite(v, name, min);
  return out;
};

export class Watershed {
  constructor(width, height, options = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('Invalid grid size');
    this.width = width; this.height = height; this.n = width * height; this.day = 0;
    this.bed = array(this.n, options.bed ?? 0, 'bed', -Infinity);
    this.surface = array(this.n, options.surface ?? 0, 'surface');
    this.soil = array(this.n, options.soil ?? 0, 'soil');
    this.groundwater = array(this.n, options.groundwater ?? 0, 'groundwater');
    this.infiltration = array(this.n, options.infiltration ?? .08, 'infiltration');
    this.capacity = array(this.n, options.capacity ?? .5, 'capacity');
    this.baseflow = array(this.n, options.baseflow ?? .025, 'baseflow');
    for (let i = 0; i < this.n; i++) {
      if (this.capacity[i] <= 0 || this.soil[i] > this.capacity[i]) throw new RangeError('Soil exceeds capacity');
    }
    this.conductance = finite(options.conductance ?? 3, 'conductance');
    this.rechargeRate = finite(options.rechargeRate ?? .045, 'rechargeRate');
    this.maxStep = finite(options.maxStep ?? .05, 'maxStep');
    if (this.maxStep <= 0 || this.maxStep > .25) throw new RangeError('Invalid maximum step');
    this.edgeA = []; this.edgeB = []; this.edgeAxis = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width) { this.edgeA.push(i); this.edgeB.push(i + 1); this.edgeAxis.push(0); }
      if (y + 1 < height) { this.edgeA.push(i); this.edgeB.push(i + width); this.edgeAxis.push(1); }
    }
    this.barriers = new Map(); this.outlets = []; this.sources = [];
    this.flowX = new Float64Array(this.n); this.flowY = new Float64Array(this.n);
    this.flux = new Float64Array(this.edgeA.length); this.demand = new Float64Array(this.n);
    this.delta = new Float64Array(this.n);
    this.budget = { initial: this.storage(), rain: 0, inflow: 0, evaporation: 0, plantUse: 0, outflow: 0 };
  }
  storage() {
    let total = 0;
    for (let i = 0; i < this.n; i++) total += this.surface[i] + this.soil[i] + this.groundwater[i];
    return total;
  }
  balance() {
    const b = this.budget, stored = this.storage();
    return { ...b, stored, error: b.initial + b.rain + b.inflow - b.evaporation - b.plantUse - b.outflow - stored };
  }
  cell(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.n) throw new RangeError('Invalid cell');
    return i;
  }
  edgeBetween(a, b) {
    this.cell(a); this.cell(b);
    // Editing is infrequent; simulation reads the indexed map directly.
    const edge = this.edgeA.findIndex((v, e) => (v === a && this.edgeB[e] === b) || (v === b && this.edgeB[e] === a));
    if (edge < 0) throw new RangeError('Barrier cells must share an edge');
    return edge;
  }
  setBarrier(a, b, crest, permeability = 0) {
    finite(crest, 'crest', -Infinity); finite(permeability, 'permeability');
    if (permeability > 1) throw new RangeError('Invalid permeability');
    this.barriers.set(this.edgeBetween(a, b), { crest, permeability });
  }
  removeBarrier(a, b) { this.barriers.delete(this.edgeBetween(a, b)); }
  addSource(i, rate) { this.sources.push({ i: this.cell(i), rate: finite(rate, 'source rate') }); }
  addOutlet(i, crest = this.bed[i], conductance = this.conductance) {
    this.outlets.push({ i: this.cell(i), crest: finite(crest, 'outlet crest', -Infinity), conductance: finite(conductance, 'outlet conductance') });
  }
  step(days, { rain = 0, evaporation = 0, plantUse = 0, sourceScale = 1, infiltrationScale = 1 } = {}) {
    finite(days, 'days'); finite(rain, 'rain'); finite(evaporation, 'evaporation');
    finite(plantUse, 'plantUse'); finite(sourceScale, 'sourceScale'); finite(infiltrationScale, 'infiltrationScale');
    if (days > 30) throw new RangeError('Step at most 30 days at a time');
    if (!days) return this.balance();
    const count = Math.ceil(days / this.maxStep), dt = days / count;
    this.flowX.fill(0); this.flowY.fill(0);
    for (let s = 0; s < count; s++) {
      const precipitation = rain * dt;
      this.budget.rain += precipitation * this.n;
      for (const source of this.sources) {
        const q = source.rate * sourceScale * dt;
        this.surface[source.i] += q; this.budget.inflow += q;
      }
      for (let i = 0; i < this.n; i++) {
        this.surface[i] += precipitation;
        const infiltrated = Math.min(this.surface[i], this.capacity[i] - this.soil[i],
          this.infiltration[i] * infiltrationScale * dt * (.15 + .85 * (1 - this.soil[i] / this.capacity[i])));
        this.surface[i] -= infiltrated; this.soil[i] += infiltrated;
        const recharge = Math.min(Math.max(0, this.soil[i] - this.capacity[i] * .6), this.rechargeRate * dt);
        this.soil[i] -= recharge; this.groundwater[i] += recharge;
        const returned = this.groundwater[i] * (1 - Math.exp(-this.baseflow[i] * dt));
        this.groundwater[i] -= returned; this.surface[i] += returned;
        const evaporated = Math.min(this.surface[i], evaporation * dt);
        this.surface[i] -= evaporated; this.budget.evaporation += evaporated;
        const used = Math.min(this.soil[i], plantUse * dt);
        this.soil[i] -= used; this.budget.plantUse += used;
      }
      this.demand.fill(0); this.delta.fill(0);
      for (let e = 0; e < this.edgeA.length; e++) {
        const a = this.edgeA[e], b = this.edgeB[e];
        const ha = this.bed[a] + this.surface[a], hb = this.bed[b] + this.surface[b];
        const donor = ha > hb ? a : b, high = Math.max(ha, hb), low = Math.min(ha, hb);
        const floor = Math.max(this.bed[a], this.bed[b]), barrier = this.barriers.get(e);
        const crest = Math.max(floor, barrier?.crest ?? floor);
        const head = Math.max(0, high - Math.max(low, crest));
        const leakHead = barrier ? Math.max(0, high - Math.max(low, floor)) * barrier.permeability : 0;
        const q = Math.min(this.surface[donor], .45 * Math.max(head, leakHead),
          this.conductance * dt * (head * Math.sqrt(head) + leakHead * Math.sqrt(leakHead)));
        this.flux[e] = ha > hb ? q : -q; this.demand[donor] += q;
      }
      for (let e = 0; e < this.edgeA.length; e++) {
        const a = this.edgeA[e], b = this.edgeB[e], donor = this.flux[e] > 0 ? a : b;
        const q = this.flux[e] * Math.min(1, this.demand[donor] ? this.surface[donor] / this.demand[donor] : 1);
        this.delta[a] -= q; this.delta[b] += q;
        const flow = this.edgeAxis[e] === 0 ? this.flowX : this.flowY;
        flow[a] += q / days; flow[b] += q / days;
      }
      for (let i = 0; i < this.n; i++) this.surface[i] = Math.max(0, this.surface[i] + this.delta[i]);
      for (const outlet of this.outlets) {
        const head = Math.max(0, this.bed[outlet.i] + this.surface[outlet.i] - outlet.crest);
        const q = Math.min(this.surface[outlet.i], head, outlet.conductance * head * Math.sqrt(head) * dt);
        this.surface[outlet.i] -= q; this.budget.outflow += q;
      }
    }
    this.day += days;
    return this.balance();
  }
  serialize() {
    return { version: 1, width: this.width, height: this.height, day: this.day,
      ...Object.fromEntries(['bed', 'surface', 'soil', 'groundwater', 'infiltration', 'capacity', 'baseflow'].map(k => [k, Array.from(this[k])])),
      conductance: this.conductance, rechargeRate: this.rechargeRate, maxStep: this.maxStep,
      sources: this.sources.map(s => ({ ...s })), outlets: this.outlets.map(o => ({ ...o })),
      barriers: [...this.barriers].map(([edge, b]) => ({ a: this.edgeA[edge], b: this.edgeB[edge], ...b })), budget: { ...this.budget } };
  }
  static deserialize(data) {
    if (data?.version !== 1) throw new RangeError('Unsupported watershed state');
    const w = new Watershed(data.width, data.height, data);
    w.day = finite(data.day, 'day');
    for (const s of data.sources) w.addSource(s.i, s.rate);
    for (const o of data.outlets) w.addOutlet(o.i, o.crest, o.conductance);
    for (const b of data.barriers) w.setBarrier(b.a, b.b, b.crest, b.permeability);
    for (const key of Object.keys(w.budget)) w.budget[key] = finite(data.budget[key], 'budget ' + key);
    if (Math.abs(w.balance().error) > 1e-7 * Math.max(1, w.storage())) throw new RangeError('Inconsistent water budget');
    return w;
  }
}
