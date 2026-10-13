// Deliberate clambering, even when game time or catch-up movement runs faster.
export const ORANGUTAN_CADENCE = 4.2;

// Back down steep wood with the head uphill, but face forward again as soon
// as the route levels out or climbs the receiving limb of a fork.
export function orangutanReverse(heading, descending = false, facing = null) {
  const slope = heading.lengthSq() > 1e-8 ? heading.y / heading.length() : 0;
  const uphillFacing = !facing || facing.x * heading.x + facing.z * heading.z < 0;
  return (slope < -.45 && uphillFacing) || (descending && slope <= -.1);
}
