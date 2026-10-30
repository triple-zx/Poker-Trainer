// Logical players remain hero=0/opponent=1 regardless of their physical seats.
export const firstPlayer = (s) => (s.heroPosition === "ip" ? 1 : 0);
export const playerPosition = (s, player) =>
  player === firstPlayer(s) ? "oop" : "ip";
export function validatePosition(s) {
  if (s.heroPosition !== undefined && !["oop", "ip"].includes(s.heroPosition))
    throw Error("Choose an in-position or out-of-position hero seat");
  if (s.game !== "full" && s.heroPosition === "ip")
    throw Error("In-position training requires full-hand mode");
}
