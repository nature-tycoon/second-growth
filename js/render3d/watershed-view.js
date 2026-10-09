// A diorama for the experimental flat-cell solver. Every ground top and water
// top uses the solver's exact floor/head; no smooth terrain hides a different bed.
import * as THREE from 'three';

const triangleCorners = [[0, 0], [1, 1], [1, 0], [0, 0], [0, 1], [1, 1]];
const color = new THREE.Color();
const soilDry = new THREE.Color('#c3a76b'), soilWet = new THREE.Color('#377ca1'), wetBed = new THREE.Color('#9d9270');
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };

export class WatershedView {
  constructor(canvas, onInspect) {
    this.canvas = canvas; this.onInspect = onInspect; this.mode = 'landscape'; this.angle = Math.PI / 4; this.zoom = 1;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.outputColorSpace = THREE.SRGBColorSpace; this.gl.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#dce7df');
    this.scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x6d714a, 1.7));
    const sun = new THREE.DirectionalLight(0xffeac9, 2.5); sun.position.set(-30, 60, 20); this.scene.add(sun);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 250);
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.time = { value: 0 }; this.group = new THREE.Group(); this.scene.add(this.group);
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshPhongMaterial({ color: '#308ca5', transparent: true, opacity: .85, shininess: 100, specular: 0xc3e5ef, depthWrite: false });
    this.waterMat.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = 'attribute float aDepth; attribute vec2 aFlow; attribute vec4 aEdge; varying float vDepth; varying vec2 vFlow; varying vec2 vXZ; varying vec2 vCell; varying vec4 vEdge;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vDepth = aDepth; vFlow = aFlow; vXZ = position.xz; vCell = uv; vEdge = aEdge;`);
      shader.fragmentShader = 'uniform float uTime; varying float vDepth; varying vec2 vFlow; varying vec2 vXZ; varying vec2 vCell; varying vec4 vEdge;\n' + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vDepth < 0.004) discard;
          float deep = smoothstep(0.015, 0.65, vDepth);
          diffuseColor.rgb = mix(vec3(0.16, 0.49, 0.48), vec3(0.035, 0.20, 0.30), deep);
          float reflectSky = 0.5 + 0.5 * sin(vXZ.x * 0.32 + sin(vXZ.y * 0.23) + uTime * 0.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.72, 0.76), reflectSky * 0.07);
          float speed = length(vFlow);
          vec2 dir = speed > 0.001 ? vFlow / speed : normalize(vec2(1.0, 0.5));
          float phase = dot(vXZ, dir) * 12.0 + sin(dot(vXZ, vec2(-dir.y, dir.x)) * 2.0) - uTime * (0.5 + min(speed, 1.0) * 2.0);
          float ripple = pow(0.5 + 0.5 * sin(phase), 12.0);
          diffuseColor.rgb += vec3(0.065, 0.085, 0.085) * ripple * (0.25 + min(speed * 4.0, 0.75));
          float edge = max(max((1.0 - smoothstep(0.0, 0.14, vCell.x)) * vEdge.x,
            (1.0 - smoothstep(0.0, 0.14, 1.0 - vCell.x)) * vEdge.y),
            max((1.0 - smoothstep(0.0, 0.14, vCell.y)) * vEdge.z,
            (1.0 - smoothstep(0.0, 0.14, 1.0 - vCell.y)) * vEdge.w));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.74, 0.66), edge * 0.28);
          diffuseColor.a *= smoothstep(0.004, 0.05, vDepth) * mix(0.6, 1.0, deep);`);
    };
    this.waterMat.customProgramCacheKey = () => 'watershed-lab-water-v1';
    const inspectPointer = event => {
      if (!this.w) return;
      const rect = canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      this.ray.setFromCamera(this.pointer, this.camera);
      const hit = this.ray.intersectObjects([this.ground, this.water])[0];
      if (hit) this.onInspect(Math.floor(hit.faceIndex / 2));
    };
    canvas.addEventListener('pointermove', inspectPointer); canvas.addEventListener('pointerdown', inspectPointer);
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-event.deltaY * .001), .65, 2); this.resize(); }, { passive: false });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
  }
  setFixture(fixture) {
    for (const child of [...this.group.children]) {
      child.traverse(object => {
        object.geometry?.dispose();
        if (object.isInstancedMesh) object.dispose();
        if (object.material && ![this.groundMat, this.waterMat].includes(object.material)) object.material.dispose();
      });
      this.group.remove(child);
    }
    this.w = fixture.w; this.fixture = fixture;
    this.minBed = Math.min(...this.w.bed); this.maxBed = Math.max(...this.w.bed);
    const w = this.w, positions = new Float32Array(w.n * 18), colors = new Float32Array(w.n * 18), uv = new Float32Array(w.n * 12);
    for (let i = 0; i < w.n; i++) for (let j = 0; j < 6; j++) {
      const [dx, dy] = triangleCorners[j], o = i * 18 + j * 3;
      positions[o] = i % w.width + dx; positions[o + 1] = w.bed[i]; positions[o + 2] = Math.floor(i / w.width) + dy;
      uv[i * 12 + j * 2] = dx; uv[i * 12 + j * 2 + 1] = dy;
    }
    const groundGeo = new THREE.BufferGeometry();
    groundGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); groundGeo.computeVertexNormals();
    this.ground = new THREE.Mesh(groundGeo, this.groundMat); this.group.add(this.ground);
    // Sidewalls expose the solver's cell steps and form the diorama's soil edge.
    const walls = [];
    const wall = (x1, z1, x2, z2, top, bottom) => walls.push(x1, top, z1, x2, top, z2, x2, bottom, z2, x1, top, z1, x2, bottom, z2, x1, bottom, z1);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      const i = y * w.width + x, h = w.bed[i], low = -1.2;
      if (x + 1 < w.width) wall(x + 1, y, x + 1, y + 1, h, w.bed[i + 1]); else wall(x + 1, y, x + 1, y + 1, h, low);
      if (y + 1 < w.height) wall(x + 1, y + 1, x, y + 1, h, w.bed[i + w.width]); else wall(x + 1, y + 1, x, y + 1, h, low);
      if (!x) wall(x, y + 1, x, y, h, low); if (!y) wall(x, y, x + 1, y, h, low);
    }
    const wallGeo = new THREE.BufferGeometry(); wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3)); wallGeo.computeVertexNormals();
    this.group.add(new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ color: '#8b7656', side: THREE.DoubleSide })));
    const waterGeo = new THREE.BufferGeometry(); waterGeo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    waterGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); waterGeo.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(w.n * 6), 1));
    waterGeo.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(w.n * 12), 2)); waterGeo.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(w.n * 24), 4));
    const normals = new Float32Array(w.n * 18); for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    waterGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.water = new THREE.Mesh(waterGeo, this.waterMat); this.water.frustumCulled = false; this.water.renderOrder = 2; this.group.add(this.water);
    const arrowGeo = new THREE.BufferGeometry(); arrowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w.n * 18), 3));
    this.arrows = new THREE.LineSegments(arrowGeo, new THREE.LineBasicMaterial({ color: '#f4f8da', transparent: true, opacity: .85, depthTest: false }));
    this.arrows.frustumCulled = false; this.arrows.renderOrder = 3; this.group.add(this.arrows);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(.33, .39, 32), new THREE.MeshBasicMaterial({ color: '#fff1a9', side: THREE.DoubleSide, depthTest: false }));
    this.selection.rotation.x = -Math.PI / 2; this.selection.renderOrder = 4; this.selection.visible = false; this.group.add(this.selection);
    this.addTrees(); this.update(); this.resize();
  }
  addTrees() {
    const w = this.w, tropical = this.fixture.id === 'amazon', samples = [];
    for (let y = 1; y < w.height - 1; y += 2) for (let x = 1; x < w.width - 1; x += 2) {
      const i = y * w.width + x;
      if (w.surface[i] || hash(x, y) > .3 || (!tropical && w.bed[i] < 1.4) || (tropical && x > 19 && x < 42)) continue;
      samples.push({ x: x + .5, z: y + .5, h: w.bed[i], size: .8 + hash(x + 4, y) * .7 });
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .12, 1, 5), new THREE.MeshLambertMaterial({ color: '#796448' }), samples.length);
    const crown = new THREE.InstancedMesh(tropical ? new THREE.IcosahedronGeometry(.7, 1) : new THREE.ConeGeometry(.58, 1.8, 7), new THREE.MeshLambertMaterial({ color: '#426a45' }), samples.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    samples.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, p.h + p.size * .5, p.z), q, new THREE.Vector3(1, p.size, 1)); trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.h + p.size * 1.2, p.z), q, new THREE.Vector3(p.size, p.size, p.size)); crown.setMatrixAt(i, m);
      crown.setColorAt(i, new THREE.Color().setHSL(.27 + hash(p.x, p.z) * .035, .24, .28 + hash(p.z, p.x) * .1));
    });
    this.group.add(trunk, crown);
    this.dam = new THREE.Group(); this.group.add(this.dam);
    for (const edge of this.fixture.damEdges) {
      const x = edge.a % w.width, y = Math.floor(edge.a / w.width) + 1;
      const geo = new THREE.BoxGeometry(1.05, .18, .32), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#79583a' }));
      mesh.position.set(x + .5, edge.crest, y); this.dam.add(mesh);
    }
    this.dam.visible = false;
  }
  resize() {
    if (!this.w) return;
    const rect = this.canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    this.gl.setSize(width, height, false);
    const aspect = width / height, elevation = this.mode === 'flow' ? Math.PI * .43 : Math.PI * .23;
    const sa = Math.abs(Math.sin(this.angle)), ca = Math.abs(Math.cos(this.angle));
    const horizontal = (this.w.width * ca + this.w.height * sa) * .5;
    const vertical = ((this.w.width * sa + this.w.height * ca) * Math.sin(elevation)
      + (this.maxBed - this.minBed + 3) * Math.cos(elevation)) * .5;
    const extent = Math.max(horizontal, vertical * aspect) * 1.12 / this.zoom;
    this.camera.left = -extent; this.camera.right = extent; this.camera.top = extent / aspect; this.camera.bottom = -extent / aspect;
    const target = new THREE.Vector3(this.w.width * .5, (this.minBed + this.maxBed) * .5 + .5, this.w.height * .5);
    this.camera.position.copy(target).add(new THREE.Vector3(Math.sin(this.angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(this.angle) * Math.cos(elevation)).multiplyScalar(100));
    this.camera.lookAt(target); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  select(i) {
    this.selection.visible = true;
    this.selection.position.set(i % this.w.width + .5, this.w.bed[i] + this.w.surface[i] + .05, Math.floor(i / this.w.width) + .5);
  }
  update() {
    if (!this.w) return;
    const w = this.w, a = this.water.geometry.attributes, groundColor = this.ground.geometry.attributes.color.array;
    const arrows = this.arrows.geometry.attributes.position.array; let arrowCount = 0;
    const dry = (x, y) => x < 0 || y < 0 || x >= w.width || y >= w.height || w.surface[y * w.width + x] < .004;
    for (let i = 0; i < w.n; i++) {
      const x = i % w.width, y = Math.floor(i / w.width), depth = w.surface[i], noise = hash(x, y);
      const moisture = w.soil[i] / w.capacity[i];
      if (this.mode === 'moisture') color.copy(soilDry).lerp(soilWet, moisture);
      else color.setHSL(.21 + noise * .035, .25, .43 + noise * .07).multiplyScalar(1 - moisture * .18);
      if (depth > .015 && this.mode !== 'moisture') color.lerp(wetBed, .55);
      const edge = [dry(x - 1, y), dry(x + 1, y), dry(x, y - 1), dry(x, y + 1)];
      for (let j = 0; j < 6; j++) {
        const v = i * 6 + j;
        a.position.array[v * 3 + 1] = w.bed[i] + depth + .003; a.aDepth.array[v] = depth;
        a.aFlow.array[v * 2] = w.flowX[i]; a.aFlow.array[v * 2 + 1] = w.flowY[i];
        for (let k = 0; k < 4; k++) a.aEdge.array[v * 4 + k] = Number(edge[k]);
        color.toArray(groundColor, v * 3);
      }
      if (this.mode === 'flow' && x % 2 === 0 && y % 2 === 0 && depth > .008) {
        const speed = Math.hypot(w.flowX[i], w.flowY[i]); if (speed < .001) continue;
        const dx = w.flowX[i] / speed * .7, dz = w.flowY[i] / speed * .7, xx = x + .5, zz = y + .5, h = w.bed[i] + depth + .05;
        const tipX = xx + dx, tipZ = zz + dz;
        const values = [xx, h, zz, tipX, h, tipZ, tipX, h, tipZ, tipX - dx * .35 - dz * .25, h, tipZ - dz * .35 + dx * .25,
          tipX, h, tipZ, tipX - dx * .35 + dz * .25, h, tipZ - dz * .35 - dx * .25];
        arrows.set(values, arrowCount); arrowCount += values.length;
      }
    }
    for (const key of ['position', 'aDepth', 'aFlow', 'aEdge']) a[key].needsUpdate = true;
    this.ground.geometry.attributes.color.needsUpdate = true;
    this.arrows.geometry.setDrawRange(0, arrowCount / 3); this.arrows.geometry.attributes.position.needsUpdate = true;
    this.water.visible = this.mode !== 'moisture'; this.arrows.visible = this.mode === 'flow';
    this.dam.visible = this.w.barriers.size > 0;
  }
  render(seconds) { this.time.value = seconds; this.gl.render(this.scene, this.camera); }
}
