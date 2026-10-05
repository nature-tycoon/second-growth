// Adult wildlife scale in tile units. Keep proportion tuning separate from display boosts:
// scale corrects a model's relative size; show preserves readability for small/distant animals.
// Juvenile and age factors are applied by Actors after this common adult scale.
export const ANIMAL_MODEL_UNIT = 0.62 / 50;
export function adultAnimalScale(sprite, visibility = true) {
  return ANIMAL_MODEL_UNIT * (sprite.scale ?? 1) * (visibility ? sprite.show ?? 1 : 1);
}
