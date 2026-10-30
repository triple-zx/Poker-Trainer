import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardId, comboId, jointDeals, potFractionWagerTo, transferMass, mixPolicy,
  decisionLoss, canonicalJson, computationDigest, transitionJob, trainingGate,
} from '../contracts/reference.mjs';

const hand = (a, b, weight = 1) => ({ cards: [cardId(a), cardId(b)], weight });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('canonical combo indexing is a bijection over all 1326 unordered hands', () => {
  const ids = new Set();
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    const id = comboId(a, b);
    assert.equal(id, comboId(b, a)); ids.add(id);
  }
  assert.equal(ids.size, 1326);
  assert.equal(Math.min(...ids), 0); assert.equal(Math.max(...ids), 1325);
});
test('invalid and repeated cards are rejected', () => {
  for (const input of ['10s', 'AX', '', 'as', 'AA']) assert.throws(() => cardId(input));
  assert.throws(() => comboId(0, 0)); assert.throws(() => comboId(0, 52));
});
test('joint card removal changes hero marginal: retrying only villain would bias it', () => {
  const a = [hand('As', 'Ah'), hand('Ks', 'Kh')];
  const b = [hand('As', 'Qc'), hand('Js', 'Jh')];
  const joint = jointDeals(a, b);
  assert.equal(joint.length, 3);
  near(joint.filter(e => e.i === 0).reduce((s, e) => s + e.probability, 0), 1 / 3);
  near(joint.filter(e => e.i === 1).reduce((s, e) => s + e.probability, 0), 2 / 3);
});
test('weights and board blockers are respected', () => {
  const joint = jointDeals([hand('As', 'Ah'), hand('Ks', 'Kh', 0.25)], [hand('Js', 'Jh')]);
  near(joint[0].probability, 0.8); near(joint[1].probability, 0.2);
  assert.deepEqual(jointDeals([hand('As', 'Ah'), hand('Ks', 'Kh')], [hand('Js', 'Jh')], [cardId('As')]),
    [{ i: 1, j: 0, probability: 1 }]);
});
test('no legal mass, duplicate combos, and invalid weights fail explicitly', () => {
  assert.throws(() => jointDeals([hand('As', 'Ah')], [hand('As', 'Qc')]));
  assert.throws(() => jointDeals([hand('As', 'Ah', 0)], [hand('Ks', 'Qc')]));
  assert.throws(() => jointDeals([hand('As', 'Ah'), hand('Ah', 'As')], [hand('Ks', 'Qc')]));
  for (const w of [NaN, Infinity, -0.1, 1.1]) assert.throws(() => jointDeals([hand('As', 'Ah', w)], [hand('Ks', 'Qc')]));
});
test('pot-size raise uses pot AFTER calling and returns street total', () => {
  assert.equal(potFractionWagerTo({ potTicks: 150, toCallTicks: 50, committedTicks: 0, sizeBps: 10000 }), 250);
  assert.equal(potFractionWagerTo({ potTicks: 150, toCallTicks: 50, committedTicks: 20, sizeBps: 5000 }), 170);
});
test('wager rounding is half up in integer ticks and overflow is rejected', () => {
  assert.equal(potFractionWagerTo({ potTicks: 5, toCallTicks: 0, committedTicks: 0, sizeBps: 5000 }), 3);
  assert.throws(() => potFractionWagerTo({ potTicks: Number.MAX_SAFE_INTEGER, toCallTicks: 1, committedTicks: 0, sizeBps: 10000 }));
  assert.throws(() => potFractionWagerTo({ potTicks: 10.5, toCallTicks: 0, committedTicks: 0, sizeBps: 5000 }));
});
test('call-too-much transfer conserves probability and leaves raises unchanged', () => {
  const original = [0.4, 0.4, 0.2];
  const shifted = transferMass(original, 0, 1, 0.5);
  near(shifted[0], 0.2); near(shifted[1], 0.6); near(shifted[2], 0.2);
  assert.deepEqual(original, [0.4, 0.4, 0.2]);
  near(transferMass(original, 0, 1, 1).reduce((s, p) => s + p, 0), 1);
});
test('invalid policies and impossible transfers do not normalize silently', () => {
  assert.throws(() => transferMass([0.2, 0.3], 0, 1, 0.2));
  assert.throws(() => transferMass([0.5, 0.5], 0, 0, 0.2));
  assert.throws(() => transferMass([0.5, 0.5], 0, 1, 2));
});
test('policy blend respects endpoints and action shape', () => {
  assert.deepEqual(mixPolicy([1, 0], [0, 1], 0), [1, 0]);
  assert.deepEqual(mixPolicy([1, 0], [0, 1], 1), [0, 1]);
  assert.deepEqual(mixPolicy([1, 0], [0, 1], 0.25), [0.75, 0.25]);
  assert.throws(() => mixPolicy([1], [0, 1], 0.5));
});
test('two-decision blend demonstrates why EV cannot be linearly interpolated', () => {
  // A unit payoff requires choosing Continue at both decisions; otherwise payoff 0.
  // Baseline stops at both; response continues at both. Behavioral blend value is a^2.
  const p = mixPolicy([1, 0], [0, 1], 0.5)[1];
  near(p * p, 0.25);
  assert.notEqual(p * p, (1 - 0.5) * 0 + 0.5 * 1);
});
test('decision loss uses equal continuation Q values, not action frequency', () => {
  assert.deepEqual(decisionLoss([2, 2, 1], 0), { kind: 'finite', value: 0 });
  assert.deepEqual(decisionLoss([2, 2, 1], 1), { kind: 'finite', value: 0 });
  assert.deepEqual(decisionLoss([2, 2, 1], 2), { kind: 'finite', value: 1 });
});
test('undefined Q never becomes zero loss and invalid numeric Q is rejected', () => {
  assert.equal(decisionLoss([null, 1], 1).kind, 'undefined');
  assert.throws(() => decisionLoss([NaN, 1], 1));
  assert.throws(() => decisionLoss([1, 2], 4));
});
test('canonical digest ignores object insertion order but keeps array order', () => {
  assert.equal(computationDigest({ b: 2, a: 1 }), computationDigest({ a: 1, b: 2 }));
  assert.notEqual(computationDigest([1, 2]), computationDigest([2, 1]));
  assert.equal(canonicalJson(-0), '0');
});
test('every modeled computational setting changes identity', () => {
  const base = { range: [0.5, 1], rakeBps: 0, opponent: 'A', tree: 'T', alpha: 0.5, engine: 'E', seed: 10 };
  for (const [k, v] of Object.entries({ range: [1, 1], rakeBps: 500, opponent: 'B', tree: 'U', alpha: 1, engine: 'F', seed: 11 })) {
    assert.notEqual(computationDigest(base), computationDigest({ ...base, [k]: v }), k);
  }
});
test('non-JSON values cannot produce deceptively equal hashes', () => {
  for (const value of [NaN, Infinity, undefined, { a: undefined }, new Date(), [,,1]]) assert.throws(() => canonicalJson(value));
});
test('job cannot become complete without export and verification', () => {
  let job = { state: 'queued', revision: 0 };
  job = transitionJob(job, 0, 'running');
  assert.throws(() => transitionJob(job, 1, 'completed'));
  job = transitionJob(job, 1, 'exporting');
  job = transitionJob(job, 2, 'verifying');
  job = transitionJob(job, 3, 'completed');
  assert.deepEqual(job, { state: 'completed', revision: 4 });
  assert.throws(() => transitionJob(job, 4, 'running'));
});
test('stale job controls fail and disk pause requires checkpointing', () => {
  const job = { state: 'running', revision: 4 };
  assert.throws(() => transitionJob(job, 3, 'paused_memory'));
  assert.throws(() => transitionJob(job, 4, 'paused_disk'));
  const saving = transitionJob(job, 4, 'checkpointing');
  assert.equal(transitionJob(saving, 5, 'paused_disk').state, 'paused_disk');
});
// Manufactured gate input for contract testing only: this is not an actual solution.
function manifest() {
  return {
    formatVersion: 1, computationId: 'C', treeId: 'T', publication: 'committed',
    source: { kind: 'computed' }, termination: 'completed', qualityStatus: 'target_met',
    profiles: [{ id: 'P' }], coverage: {
      computationId: 'C', treeId: 'T', status: 'complete', fullPublicRunouts: true,
      allOfferedActions: true, allTerminals: true, policyRowsValidated: true,
      semanticEdgesValidated: true, contentHashesValidated: true, evaluatedProfiles: ['P'],
    },
  };
}
test('complete matching verified profile passes the policy gate', () => {
  assert.deepEqual(trainingGate(manifest(), 'P'), { ready: true, reasons: [] });
});
for (const field of ['fullPublicRunouts', 'allOfferedActions', 'allTerminals', 'policyRowsValidated', 'semanticEdgesValidated', 'contentHashesValidated']) {
  test(`missing ${field} prevents training even when approximate quality is allowed`, () => {
    const m = manifest(); m.coverage[field] = false;
    assert.equal(trainingGate(m, 'P', { allowApproximate: true }).ready, false);
  });
}
test('a transplanted coverage report cannot certify another tree or computation', () => {
  for (const field of ['treeId', 'computationId']) {
    const m = manifest(); m.coverage[field] = 'other';
    assert.equal(trainingGate(m, 'P').ready, false);
  }
});
test('each alpha/profile requires its own evaluated data', () => {
  const m = manifest(); m.profiles.push({ id: 'P2' });
  assert.equal(trainingGate(m, 'P2').ready, false);
});
test('partial quality needs opt-in but partial coverage can never be opted into', () => {
  const m = manifest(); m.termination = 'budget_exhausted'; m.qualityStatus = 'target_unmet';
  assert.equal(trainingGate(m, 'P').ready, false);
  assert.equal(trainingGate(m, 'P', { allowApproximate: true }).ready, true);
  m.coverage.status = 'partial';
  assert.equal(trainingGate(m, 'P', { allowApproximate: true }).ready, false);
});
test('staged output and synthetic fixtures cannot masquerade as ordinary training', () => {
  const m = manifest(); m.publication = 'staged';
  assert.equal(trainingGate(m, 'P').ready, false);
  m.publication = 'committed'; m.source.kind = 'synthetic_test';
  assert.equal(trainingGate(m, 'P', { allowApproximate: true }).ready, false);
});
