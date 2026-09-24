import type { DecisionProvider, DecisionQuestion, DecisionResult, TypedDecision } from "./types.ts";

export interface EvalCase {
  id: string;
  state: unknown;
  question: string;
  type: DecisionQuestion["type"];
  options?: string[];
  evidenceRefs: string[];
  expected: TypedDecision;
}

export interface EvalReport {
  accuracy: number;
  meanConfidence: number;
  latencyMs: number;
  provider: string;
  model: string;
  cases: number;
}

function sameDecision(actual: TypedDecision, expected: TypedDecision): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function evaluateCases(
  provider: DecisionProvider,
  cases: EvalCase[],
): Promise<EvalReport> {
  const started = Date.now();
  let matches = 0;
  let confidenceSum = 0;
  for (const item of cases) {
    const question: DecisionQuestion = {
      id: item.id,
      type: item.type,
      prompt: item.question,
      state: item.state,
      options: item.options,
      evidenceRefs: item.evidenceRefs,
    };
    const result = await provider.decide(question);
    if (sameDecision(result.answer, item.expected)) matches += 1;
    confidenceSum += result.answer.confidence;
  }
  const total = cases.length;
  return {
    accuracy: total === 0 ? 0 : matches / total,
    meanConfidence: total === 0 ? 0 : confidenceSum / total,
    latencyMs: Date.now() - started,
    provider: provider.name,
    model: provider.model,
    cases: total,
  };
}

export function resultOf(question: DecisionQuestion, answer: TypedDecision, provider: DecisionProvider): DecisionResult {
  return {
    questionId: question.id,
    type: question.type,
    answer,
    provider: provider.name,
    model: provider.model,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
