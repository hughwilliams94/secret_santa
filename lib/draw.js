'use strict';

/**
 * Returns true if `giver` is allowed to buy for `receiver`.
 * Rules: nobody draws themselves, nobody draws someone in their own
 * household (spouses/partners), and nobody draws someone on their
 * personal exclusion list (in either direction).
 */
function canGive(giver, receiver) {
  if (giver.id === receiver.id) return false;
  if (giver.household && receiver.household &&
      giver.household.trim().toLowerCase() === receiver.household.trim().toLowerCase()) {
    return false;
  }
  if ((giver.exclusions || []).includes(receiver.id)) return false;
  if ((receiver.exclusions || []).includes(giver.id)) return false;
  return true;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomly assigns every participant someone to buy for, respecting the
 * exclusion rules. Returns a map of giverId -> receiverId.
 * Throws if no valid assignment exists.
 */
function draw(participants, rng = Math.random) {
  if (participants.length < 2) {
    throw new Error('You need at least 2 people to draw names.');
  }

  // Try the most constrained givers first – makes backtracking fast.
  const options = new Map(participants.map(g => [
    g.id, participants.filter(r => canGive(g, r)),
  ]));
  for (const p of participants) {
    if (options.get(p.id).length === 0) {
      throw new Error(`${p.name} has nobody they're allowed to draw. Loosen the exclusions.`);
    }
  }
  const givers = shuffle(participants, rng)
    .sort((a, b) => options.get(a.id).length - options.get(b.id).length);

  const result = {};
  const taken = new Set();
  let steps = 0;

  function solve(i) {
    if (i === givers.length) return true;
    if (++steps > 200000) return false;
    const giver = givers[i];
    for (const r of shuffle(options.get(giver.id), rng)) {
      if (taken.has(r.id)) continue;
      taken.add(r.id);
      result[giver.id] = r.id;
      if (solve(i + 1)) return true;
      taken.delete(r.id);
      delete result[giver.id];
    }
    return false;
  }

  if (!solve(0)) {
    throw new Error('No valid draw is possible with these exclusions. Try removing some.');
  }
  return result;
}

module.exports = { draw, canGive };
