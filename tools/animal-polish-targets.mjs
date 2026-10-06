// Shared by the inspection viewer and audits; excludes mammals with separate builders.
export function isPolishModel(sprite) {
  return sprite.kind === 'elephant' && !sprite.asian ||
    sprite.kind === 'rhino' && !sprite.hairy ||
    ['giraffe', 'zebra', 'wildebeest', 'otter'].includes(sprite.kind) ||
    sprite.kind === 'raccoon' && !sprite.coati && !sprite.opossum && !sprite.civet;
}
