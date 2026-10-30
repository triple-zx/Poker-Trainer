/** Executable specification helpers; not a production solver or an import validator. */
import { createHash } from 'node:crypto';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function finite(value, name) {
  requireCondition(typeof value === 'number' && Number.isFinite(value), `${name} must be finite`);
}
function probability(value, name) {
  finite(value, name);
  requireCondition(value >= 0 && value <= 1, `${name} must be in [0,1]`);
}
function ticks(value, name) {
  requireCondition(Number.isSafeInteger(value) && value >= 0, `${name} must be nonnegative safe integer`);
}
function validCard(value) {
  requireCondition(Number.isInteger(value) && value >= 0 && value < 52, 'invalid card ID');
}
export function cardId(text) {
  requireCondition(typeof text === 'string' && /^[2-9TJQKA][cdhs]$/.test(text), 'invalid card');
  return 4 * '23456789TJQKA'.indexOf(text[0]) + 'cdhs'.indexOf(text[1]);
}
export function comboId(a, b) {
  validCard(a); validCard(b);
  requireCondition(a !== b, 'duplicate card');
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return hi * (hi - 1) / 2 + lo;
}
function validateRange(range) {
  requireCondition(Array.isArray(range) && range.length > 0, 'empty range');
  const seen = new Set();
  for (const { cards, weight } of range) {
    requireCondition(Array.isArray(cards) && cards.length === 2, 'combo needs two cards');
    const id = comboId(...cards);
    requireCondition(!seen.has(id), 'duplicate combo');
    seen.add(id);
    probability(weight, 'range weight');
  }
}
/** Exact tiny-range enumeration. Real engine must avoid materializing this dense joint. */
export function jointDeals(range0, range1, board = []) {
  validateRange(range0); validateRange(range1);
  requireCondition(Array.isArray(board) && board.length <= 5, 'invalid board');
  board.forEach(validCard);
  requireCondition(new Set(board).size === board.length, 'duplicate board card');
  const entries = [];
  let total = 0;
  range0.forEach((a, i) => range1.forEach((b, j) => {
    const all = [...board, ...a.cards, ...b.cards];
    if (new Set(all).size !== all.length) return;
    const mass = a.weight * b.weight;
    if (mass > 0) { entries.push({ i, j, probability: mass }); total += mass; }
  }));
  requireCondition(total > 0 && Number.isFinite(total), 'zero compatible joint mass');
  return entries.map(e => ({ ...e, probability: e.probability / total }));
}
/** Legalization (min raise, stacks, reopening) is a separate domain operation. */
export function potFractionWagerTo({ potTicks, toCallTicks, committedTicks, sizeBps }) {
  for (const [name, value] of Object.entries({ potTicks, toCallTicks, committedTicks, sizeBps })) ticks(value, name);
  const increment = ((BigInt(potTicks) + BigInt(toCallTicks)) * BigInt(sizeBps) + 5000n) / 10000n;
  const target = BigInt(committedTicks) + BigInt(toCallTicks) + increment;
  requireCondition(target <= BigInt(Number.MAX_SAFE_INTEGER), 'chip overflow');
  return Number(target);
}
function policyRow(row) {
  requireCondition(Array.isArray(row) && row.length > 0, 'empty policy row');
  row.forEach((p, i) => probability(p, `probability ${i}`));
  requireCondition(Math.abs(row.reduce((a, b) => a + b, 0) - 1) <= 1e-9, 'policy row must sum to one');
}
export function transferMass(row, from, to, fraction) {
  policyRow(row); probability(fraction, 'transfer fraction');
  requireCondition(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= 0
    && from < row.length && to < row.length && from !== to, 'invalid transfer actions');
  const out = [...row];
  const mass = out[from] * fraction;
  out[from] -= mass; out[to] += mass;
  return out;
}
export function mixPolicy(baseline, response, alpha) {
  policyRow(baseline); policyRow(response); probability(alpha, 'alpha');
  requireCondition(baseline.length === response.length, 'action sets differ');
  return baseline.map((p, i) => (1 - alpha) * p + alpha * response[i]);
}
export function decisionLoss(qValues, chosen) {
  requireCondition(Array.isArray(qValues) && qValues.length > 0, 'empty Q row');
  requireCondition(Number.isInteger(chosen) && chosen >= 0 && chosen < qValues.length, 'invalid chosen action');
  if (qValues.some(q => q === null)) return { kind: 'undefined', reason: 'unavailable' };
  qValues.forEach((q, i) => finite(q, `Q ${i}`));
  return { kind: 'finite', value: Math.max(...qValues) - qValues[chosen] };
}
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { finite(value, 'JSON number'); return JSON.stringify(value); }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) requireCondition(i in value, 'sparse array');
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  requireCondition(typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'unsupported JSON value');
  requireCondition(Object.getOwnPropertySymbols(value).length === 0, 'symbol keys unsupported');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
export function computationDigest(canonicalInput) {
  return 'sha256:' + createHash('sha256').update(canonicalJson(canonicalInput)).digest('hex');
}
export const jobTransitions = Object.freeze({
  queued: ['running', 'cancelled', 'failed'],
  running: ['paused_memory', 'checkpointing', 'exporting', 'interrupted', 'cancelled', 'failed'],
  paused_memory: ['running', 'checkpointing', 'interrupted', 'cancelled'],
  checkpointing: ['running', 'paused_disk', 'interrupted', 'cancelled', 'failed'],
  paused_disk: ['queued', 'running', 'cancelled', 'failed'],
  exporting: ['verifying', 'interrupted', 'cancelled', 'failed'],
  verifying: ['completed', 'cancelled', 'failed'],
  interrupted: ['queued', 'cancelled', 'failed'],
  completed: [], cancelled: [], failed: [],
});
export function transitionJob(current, expectedRevision, nextState) {
  requireCondition(Number.isSafeInteger(current.revision) && current.revision >= 0, 'invalid revision');
  requireCondition(expectedRevision === current.revision, 'stale revision');
  requireCondition(jobTransitions[current.state]?.includes(nextState), 'invalid transition');
  requireCondition(current.revision < Number.MAX_SAFE_INTEGER, 'revision overflow');
  return { state: nextState, revision: current.revision + 1 };
}
/** Policy gate after trusted verification. It does NOT verify an arbitrary artifact. */
export function trainingGate(manifest, profileId, { allowApproximate = false } = {}) {
  const reasons = [];
  const c = manifest.coverage;
  if (manifest.formatVersion !== 1) reasons.push('format');
  if (manifest.source?.kind === 'synthetic_test') reasons.push('synthetic');
  if (manifest.publication !== 'committed') reasons.push('uncommitted');
  if (!['completed', 'budget_exhausted'].includes(manifest.termination)) reasons.push('termination');
  if (!c || c.computationId !== manifest.computationId || c.treeId !== manifest.treeId) reasons.push('identity');
  if (!c || c.status !== 'complete' || !c.fullPublicRunouts || !c.allOfferedActions || !c.allTerminals
    || !c.policyRowsValidated || !c.semanticEdgesValidated || !c.contentHashesValidated) reasons.push('coverage');
  if (!manifest.profiles?.some(p => p.id === profileId) || !c?.evaluatedProfiles?.includes(profileId)) reasons.push('profile');
  if (manifest.qualityStatus !== 'target_met' && !allowApproximate) reasons.push('quality');
  if (!['target_met', 'target_unmet', 'not_certified'].includes(manifest.qualityStatus)) reasons.push('unknown_quality');
  return { ready: reasons.length === 0, reasons };
}
