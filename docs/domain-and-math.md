# Domain and numerical semantics

These conventions are implementation contracts. Tiny executable reference examples
live in contracts/reference.mjs; production implementations will belong to Rust crates.

## 1. Cards, ranges, and units

- External cards use rank 2..9,T,J,Q,K,A and suit c,d,h,s. Canonical card ID is
  4*rank_index+suit_index, with rank_index starting at 2 and suit_index ordered c,d,h,s.
- An unordered combo is two distinct sorted card IDs. Its dense index is
  high*(high-1)/2+low, yielding 0..1325. Engine ordering is translated explicitly.
- A range is 1326 finite weights in [0,1]. These are frequencies relative to the same
  deal prior, not 169 equally likely hand classes and not independently normalized
  probabilities. Explicit imported weights are preserved with source metadata.
- Reject repeated cards, negative/NaN weights, duplicate combo entries, and zero legal
  joint mass. Remove board-blocked combinations in normalization with an explicit
  report; the canonical solve input contains only compatible combinations.
- Chips are safe integers at the boundary. Initial unit: 1000 ticks per big blind.
  Reject overflow and adapter i32 limits rather than coercing. EV is finite float64 in
  ticks at the boundary, with a declared reference; display conversions are separate.
- Percentages have named units: rate 0.01 means 1%, basis points 100 means 1%. Never
  infer units from the magnitude of an unlabelled number.

For flop B and raw weights w0,w1, the joint deal probability is proportional to

    w0(h0) * w1(h1) * 1[h0,h1,B are pairwise disjoint].

To sample exactly, either reject an entire independently proposed pair on collision,
or sample h0 with mass w0(h0)*sum_compatible(w1), then h1 conditionally. Sampling h0
from w0 once and retrying only h1 is biased. After the private cards are drawn, sample
turn/river without replacement from the remaining physical deck. Targeted practice is
explicit conditioning and must not silently change a saved strategy's beliefs.

At a public history, multiply each player's combo weight by that player's action reach
and condition the joint distribution on public cards. Marginal reports account for
compatible opponent mass. Hero-visible evaluation also conditions on the hero's cards.
Do not condition policy choice on the sampled but hidden opponent cards. Ignore folded
player card removal (bunching) in v1 and label that assumption even for 6-max-derived
ranges. Bunching is a separate versioned model, not implicitly enabled by table size.

## 2. Betting and payoff conventions

Public actions are fold, check, call, and wager_to(total commitment on this street).
Bet/raise/all-in are display classifications of a wager. Store action identity by
semantic amount, never by an engine's temporary action-array index.

Let pot P include already committed wagers and c be the amount needed to call. A
pot-fraction raise r means: first call c, then add r*(P+c). If one's street commitment
is x, target commitment is x+c+round(r*(P+c)). A bet when c=0 has the corresponding
formula. Round nonnegative ticks half-up, then enforce minimum raises and stack caps;
deduplicate sizes after rounding. Report the resulting amount to the user. Example:
P=150 ticks, c=50, x=0, r=1 gives wager_to(250), not 150 or 200.

The domain ledger handles full-raise increments, short all-ins and reopening, uncalled
returns, and terminal states. The first fixed-flop scenario starts OOP to act with no
outstanding wager. Arbitrary midstreet roots are later work. Unequal heads-up stacks
are reduced to effective matched exposure with excess returned; side pots/multiway
rules are not supported by this v1 contract.

Rake configuration records rate, cap, eligible-pot rule, and collection conditions.
The intended v1 rule is a percentage of the matched final pot (uncalled amounts already
returned), capped, floored to ticks, with postflop folds and showdown eligible. Native
engine equivalence must be tested; a mismatch is unsupported, never approximate-by-default.

Root EV convention: final received payout minus additional investment after the solve
root. Existing root pot is sunk/external to this measure. Thus utility0+utility1 equals
root_pot-rake, not zero. Node Q values use payout minus future investment after the
node; comparisons at a node share the same sunk-cost convention. Engine centered EVs
must be converted and tested against terminal ledgers. Realized winnings, equity,
root EV, and node decision loss are different metrics.

## 3. Baseline, opponent policy, and best response

A baseline is an approximate equilibrium in a specified finite action tree, not in the
continuous-size game. Record both ranges, tree, rake, precision, and computation identity.
For comparing exploitative adjustments, evaluate baseline hero and response hero against
the SAME frozen opponent and SAME starting distribution. If preflop changes the range,
compute a new baseline for that range; keep cross-range comparisons separately labeled.

Compile opponent tendencies into a complete behavioral policy before responding:

1. Use baseline policy as fallback at all opponent information sets.
2. Apply selected deterministic, versioned tendency transforms.
3. Apply category-level overrides.
4. Apply exact node/combo overrides last; reject conflicting equal-priority overrides.
5. Validate finite nonnegative probabilities summing to one, legal actions, and coverage.

Initial tendency implementation: explicit probability-mass transfers. A call-too-much
control t in [0,1] moves t*p(fold) from fold to call at matching nodes. A bluff-less
control moves t*p(wager) to check for the explicitly selected candidate-hand category
at nodes where checking is legal; do not apply it to facing-bet nodes without a defined
destination. Category definitions and affected nodes are inspectable. These are
modeling choices, not empirical claims that a slider identifies a real player's policy.
More advanced strength/size-specific transforms get new compiler versions.

Preflop tendency editing initially changes explicit combo weights or action frequencies
in an imported preset and derives the resulting range. It is not a six-player equilibrium
re-solve. A zero-probability history has no Bayesian posterior: ask for a scenario/range
revision or mark the result undefined, rather than silently inserting a uniform range.

Against a fixed policy, best response maximizes expected utility at hero information
sets after averaging over hidden opponent hands. It must not maximize separately for
each hidden opponent hand (clairvoyant play). Prefer a dedicated dynamic program over
the finite tree; CFR with every opponent node locked is an integration fallback to
validate, not a proof of exactness. Rake does not obstruct best response against a fixed
opponent, although it changes equilibrium/convergence guarantees for both players.

Suit isomorphism is valid only if board, ranges, action restrictions, and every policy
lock are invariant under the same permutation. A suit-specific manual lock can break
an engine's original symmetry assumption. Rebuild without the invalid quotient or
reject the unsupported model; never silently copy its policy across non-equivalent suits.

## 4. Deviation control and grading

Define the first deviation control explicitly as behavioral interpolation:

    pi_alpha(a|I) = (1-alpha)*pi_baseline(a|I) + alpha*pi_response(a|I).

It is a user-controlled blend, not a robustness certificate. Evaluate its EV by a new
policy traversal against the frozen opponent; do NOT interpolate action EVs or whole
policy EVs. The value is generally nonlinear in alpha across several decisions, and
no monotonic gain is advertised without evaluating it.

Default preparation profiles: alpha in {0,0.25,0.5,0.75,1}. Users can add a specific
alpha before preparation. Training binds one prepared profile; an arbitrary alpha
change requests preparation before the next session, not computation during a hand.
The opponent remains fixed across these alpha comparisons.

Each profile stores Q for every offered action using the same declared future hero
continuation policy and fixed opponent, including low-frequency actions. Decision loss
is max_a Q(I,a)-Q(I,chosen) when Q is defined. Also show reference-policy expected Q;
do not confuse it with the action maximum. Baseline-training and exploit-training
results have separate objective IDs and cannot be pooled without grouping.

Joint reach zero means undefined conditional EV, not EV=0. For off-policy training
actions, use counterfactual opponent/chance reach with the actual public history;
hero's past zero action frequency alone must not prevent evaluation of an action it
was allowed to choose. If opponent/chance compatibility has zero mass, do not grade.

A local EV-loss sum is a training statistic, not an exact decomposition of a hand's
root EV loss when continuation policies differ. Track mixed-frequency calibration
over comparable information sets separately from single-action correctness.

## 5. Automatic sizes without an unbounded search promise

V1 fast mode uses a finite reference tree, provisional candidate bet fractions
{0.25,0.50,0.75,1.00,1.50} and raise fractions {0.50,1.00}, plus stack-aware all-in.
These are starting search settings, not recommended poker actions. The preflight
estimator may require user-visible reduction before allocating this reference tree.

For a chosen hero seat and node family:

1. Solve/evaluate a feasible richer reference tree and retain its identity.
2. Generate candidate subsets under the size-count budget; keep legal check/fold/call.
3. Restrict only the optimizing player's sizes while keeping the opponent action set
   and comparison distribution fixed. In exploit mode, use the same frozen opponent
   policy defined on the reference tree, including every evaluated candidate action.
4. Re-solve each candidate or compute a best response as appropriate; compare root
   expected utility. Rank local proposals using diagnostics, then validate the combined
   final tree globally. Local losses are not assumed additive.
5. Re-evaluate the final selected tree and prepare its training artifact completely.

First scope: size templates per player/street and selected high-reach node overrides;
do not exhaustively search every node's subsets on a normal computer. Cache each trial,
run trials sequentially, and show search coverage/budget exhaustion. Best-found is not
globally optimal. For simplifying both seats, run separately attributable passes and
report each seat's effect; an apparent EV gain after restricting the opponent is not
evidence that hero simplification was free.

Define signed delta=V_reference-V_candidate in root ticks under the stated comparison.
Store it signed; show max(0,delta) only as a labeled loss view. For a zero-sum comparison
with valid value intervals, the upper loss bound is U_reference-L_candidate. A requested
threshold is certified only if this upper bound is below it. Without such bounds show
an estimate or unresolved target. Rake/locks alter what a metric can certify; small
solver diagnostics alone do not justify a size-loss certificate.

Deep mode later refines a finite lattice around promising ratios, rounds to legal tick
amounts, expands the common reference tree, and re-evaluates. Opponent policies and
locks must be compiled anew on that expanded tree; reject unresolved node-specific
locks. No cached lock silently migrates by array position. Depth-limited/neural leaf
values are a separate research option, not necessary for v1.

## 6. Aggregation definitions

Natural board weights come from the compatible private-card joint distribution and
remaining deck, not uniform averaging of suit-canonical boards. A symmetry representative
has explicit multiplicity only when the full modeled game respects that symmetry.

Use reach-weighted averages for reports about a reached node. Distinguish natural-deal,
reach-weighted, uniformly selected boards, and user-targeted samples. Disjoint made-hand
categories sum to one; overlapping draw flags do not. Label exact enumeration versus
sampling and record sampling seed and uncertainty. A range histogram and a true
posterior conditional on known hero cards are different views.
