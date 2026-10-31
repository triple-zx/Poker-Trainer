// Explicit study-range capacities. These are not full preflop-range support or
// a guarantee that every permitted action tree fits the available computer.
export const FULL_COMBO_LIMIT = 96;
export const BOUNDED_COMBO_LIMIT = 12;
// Preserve the former worst-case policy payload: at most four legal private
// hands per action edge in a 600,000-node tree. More hands require a smaller
// tree instead of multiplying this existing capacity without a memory bound.
export const FULL_POLICY_VALUE_LIMIT = 2400000;
