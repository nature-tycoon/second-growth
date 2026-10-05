// Resolve the browser's Three.js import map for Node-based model audits.
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../vendor/three/' + specifier.slice(6), import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
