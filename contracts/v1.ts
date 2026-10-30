/** Reviewed wire-contract design, not runtime validation or an implemented API. */
export type Player = "oop" | "ip";
export type Street = "flop" | "turn" | "river";
export type Digest = string; // decoder must enforce sha256:<64 lowercase hex>
export type ChipTicks = number; // nonnegative safe integer, adapter bounds checked
export type CardId = number; // integer 0..51; see domain-and-math.md
export type ComboId = number; // integer 0..1325, not an engine index

export interface WeightedCombo {
  comboId: ComboId;
  weight: number; // finite [0,1]
}
export interface Provenance {
  kind: "user_authored" | "synthetic_test" | "imported" | "computed";
  source?: string;
  revision?: string;
  assumptions: string[];
}
export interface RakeRule {
  kind: "none" | "matched_final_pot_capped";
  rateBps: number;
  capTicks: ChipTicks;
  rounding: "floor_tick";
  appliesTo: "postflop_folds_and_showdown";
}
export interface ScenarioSpec {
  schemaVersion: 1;
  revision: Digest;
  source: Provenance;
  tableFormat: "heads_up" | "six_max";
  players: 2;
  flop: [CardId, CardId, CardId];
  firstToAct: "oop";
  potTicks: ChipTicks;
  effectiveStackTicks: ChipTicks;
  ticksPerBigBlind: 1000;
  ranges: Record<Player, WeightedCombo[]>;
  positions: Record<Player, string>;
  rake: RakeRule;
  bunching: "ignored";
}
export type PublicAction =
  | { id: string; kind: "fold" | "check" | "call" }
  | { id: string; kind: "wager_to"; streetCommitmentTicks: ChipTicks };
export type HistoryEvent =
  | { kind: "action"; player: Player; actionId: string }
  | { kind: "deal"; card: CardId };

export interface PolicyBinding {
  treeDigest: Digest;
  baselineDigest: Digest;
  compilerVersion: string;
  rulesDigest: Digest;
  concretePolicyDigest: Digest;
  opponent: Player;
}
export type OpponentRule =
  | { kind: "mass_transfer"; selectorId: string; fromActionId: string;
      toActionId: string; fraction: number; priority: number }
  | { kind: "exact_row"; nodeId: string; comboId: ComboId;
      probabilities: Record<string, number>; priority: number };
// High-level tendency UI compiles to these inspectable, versioned rules.

export interface EngineIdentity {
  name: string;
  upstreamRevision: string;
  patchDigest: Digest;
  buildId: string;
}
export interface EngineCapabilities {
  protocolVersion: 1;
  engine: EngineIdentity;
  fixedOpponent: boolean;
  exactBestResponse: boolean;
  arbitrarySuitLocks: boolean;
  fullDepthExport: boolean;
  pauseInMemory: boolean;
  resumeOptimization: boolean;
  loadFinalResult: boolean;
  rakeRules: RakeRule["kind"][];
  precisionModes: ("float32" | "scaled16")[];
  maxChipTicks: ChipTicks;
}
export interface PreparationRequest {
  requestId: string;
  scenarioRevision: Digest;
  opponentRulesDigest: Digest;
  hero: Player;
  sizing: {
    mode: "candidate_search" | "refine_lattice";
    candidateBetsBps: number[];
    candidateRaisesBps: number[];
    allIn: "separate_option";
    maxBets?: number;
    maxRaises?: number;
    targetLossRootTicks?: number;
    referenceTreeDigest?: Digest;
  };
  alphaProfiles: number[];
  limits: { peakMemoryBytes: number; diskBytes: number; wallTimeSeconds: number };
  qualityPreset: "preview" | "standard" | "precise";
}

export type MetricValue =
  | { kind: "finite"; value: number }
  | { kind: "undefined"; reason: "zero_reach" | "zero_compatible_mass" | "unavailable" };
export interface QualityMetric {
  name: "nash_conv" | "fixed_opponent_response_gap" | "estimated_size_loss";
  value: MetricValue;
  unit: "root_ticks";
  definitionVersion: string;
  deviationSpace: "full_reference_tree" | "restricted_tree" | "locked_tree";
  evidence: "measured" | "bounded" | "estimate";
  upperBound?: number;
  target?: number;
}
export interface EvaluationProfile {
  id: Digest;
  hero: Player;
  objective: "baseline_training" | "fixed_opponent_training";
  opponentPolicy: Digest;
  heroContinuationPolicy: Digest;
  alpha: number;
  nodeEvConvention: "payout_minus_future_investment";
  rootEvConvention: "payout_minus_postroot_investment";
  quality: QualityMetric[];
}
export interface CoverageReport {
  computationId: Digest;
  treeId: Digest;
  verifierVersion: string;
  fullPublicRunouts: boolean;
  allOfferedActions: boolean;
  allTerminals: boolean;
  policyRowsValidated: boolean;
  semanticEdgesValidated: boolean;
  contentHashesValidated: boolean;
  evaluatedProfiles: Digest[];
  status: "complete" | "partial" | "invalid";
}
export interface SolutionManifest {
  formatVersion: 1;
  artifactId: Digest;
  computationId: Digest;
  treeId: Digest;
  source: Provenance;
  engine: EngineIdentity;
  publication: "staged" | "committed";
  termination: "completed" | "budget_exhausted";
  qualityStatus: "target_met" | "target_unmet" | "not_certified";
  coverage: CoverageReport;
  profiles: EvaluationProfile[];
  files: { path: string; bytes: number; digest: Digest }[];
}
export interface CheckpointManifest {
  formatVersion: 1;
  computationId: Digest;
  engine: EngineIdentity;
  completedIterations: number;
  updateBoundary: "full_iteration";
  optimizerStateDigest: Digest;
  policyBinding: PolicyBinding;
  resumeVerified: boolean;
}
export type JobState = "queued" | "running" | "paused_memory" | "checkpointing"
  | "paused_disk" | "exporting" | "verifying" | "completed" | "interrupted"
  | "failed" | "cancelled";
export interface WorkerEnvelope<T> {
  protocolVersion: 1;
  requestId: string;
  jobId: string;
  sequence: number;
  type: string;
  payload: T;
}
export interface TrainingView {
  sessionId: string;
  handId: string;
  sequence: number;
  publicHistory: HistoryEvent[];
  heroCards: [CardId, CardId];
  board: CardId[];
  legalActions: PublicAction[];
  phase: "hero_turn" | "opponent_turn" | "complete";
  // Deliberately no opponentCards, Q, recommended action, or future board.
}
export interface DecisionReview {
  nodeId: string;
  chosenActionId: string;
  profileId: Digest;
  actions: { action: PublicAction; probability: number; qTicks: MetricValue }[];
  decisionLossTicks: MetricValue;
}
