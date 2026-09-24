import { validateDecisionResult } from "./validator.ts";
import type { TypedDecision } from "./types.ts";

export type PolicyAction = "EXECUTE" | "REVIEW" | "REJECT";

export interface PolicyInput {
  result: unknown;
  evidenceRefs: string[];
  critical: boolean;
  hardRule?: "deny";
}

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
}

export const policyThresholds = {
  executeProbability: 0.9,
  reviewProbability: 0.6,
  reviewScore: 80,
} as const;

function selectedProbability(answer: TypedDecision): number | null {
  if (answer.type === "noul") return answer.probability;
  if (answer.type === "choice") return answer.probabilities[answer.choice] ?? null;
  return null;
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  if (input.hardRule === "deny") {
    return { action: "REJECT", reason: "hard_rule" };
  }
  const parsed = validateDecisionResult(input.result);
  if (!parsed.ok) return { action: "REJECT", reason: "invalid_result" };
  if (input.critical && input.evidenceRefs.length === 0) {
    return { action: "REJECT", reason: "missing_evidence" };
  }
  const answer = parsed.value.answer;
  if (answer.type === "score") {
    if (answer.score >= policyThresholds.reviewScore) {
      return { action: "REVIEW", reason: "score_review" };
    }
    return { action: "REJECT", reason: "score_low" };
  }
  if (answer.type === "noul" && !answer.answer) {
    return { action: "REJECT", reason: "negative_answer" };
  }
  const probability = selectedProbability(answer);
  if (probability === null) return { action: "REJECT", reason: "missing_probability" };
  if (probability >= policyThresholds.executeProbability) {
    return { action: "EXECUTE", reason: "probability_threshold" };
  }
  if (probability >= policyThresholds.reviewProbability) {
    return { action: "REVIEW", reason: "probability_review" };
  }
  return { action: "REJECT", reason: "probability_low" };
}
