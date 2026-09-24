import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateCases, MockProvider, decidePolicy, validateDecisionResult } from "../src/decision/index.ts";
import type { DecisionResult, TypedDecision } from "../src/decision/types.ts";

const createdAt = "2026-01-01T00:00:00.000Z";

function result(answer: TypedDecision, questionId = "q1"): DecisionResult {
  return {
    questionId,
    type: answer.type,
    answer,
    provider: "mock",
    model: "deterministic-v1",
    createdAt,
  };
}

test("aceita noul, choice e score válidos", () => {
  const noul = validateDecisionResult(
    result({ type: "noul", answer: true, probability: 0.96, confidence: 0.91 }),
  );
  const choice = validateDecisionResult(
    result({
      type: "choice",
      choice: "A",
      probabilities: { A: 0.91, B: 0.06, C: 0.03 },
      confidence: 0.9,
    }),
  );
  const score = validateDecisionResult(result({ type: "score", score: 87, confidence: 0.88 }));
  assert.equal(noul.ok, true);
  assert.equal(choice.ok, true);
  assert.equal(score.ok, true);
});

test("rejeita probabilidade inválida e schema estranho", () => {
  const bad = validateDecisionResult(
    result({ type: "noul", answer: true, probability: 1.4, confidence: 0.9 }),
  );
  const extra = validateDecisionResult({
    ...result({ type: "score", score: 10, confidence: 0.5 }),
    note: "vazou",
  });
  const sum = validateDecisionResult(
    result({ type: "choice", choice: "A", probabilities: { A: 0.4, B: 0.4 }, confidence: 0.5 }),
  );
  assert.equal(bad.ok, false);
  assert.equal(extra.ok, false);
  assert.equal(sum.ok, false);
});

test("policy não executa só com confidence alta", () => {
  const decision = decidePolicy({
    result: result({ type: "noul", answer: true, probability: 0.2, confidence: 0.99 }),
    evidenceRefs: ["pedido:1"],
    critical: true,
  });
  assert.equal(decision.action, "REJECT");
  assert.equal(decision.reason, "probability_low");
});

test("hard rule e evidência vencem a probabilidade", () => {
  const denied = decidePolicy({
    result: result({ type: "noul", answer: true, probability: 0.99, confidence: 0.99 }),
    evidenceRefs: ["pedido:1"],
    critical: true,
    hardRule: "deny",
  });
  const noEvidence = decidePolicy({
    result: result({ type: "noul", answer: true, probability: 0.99, confidence: 0.99 }),
    evidenceRefs: [],
    critical: true,
  });
  const execute = decidePolicy({
    result: result({ type: "noul", answer: true, probability: 0.96, confidence: 0.4 }),
    evidenceRefs: ["produto:2"],
    critical: true,
  });
  assert.deepEqual(denied, { action: "REJECT", reason: "hard_rule" });
  assert.deepEqual(noEvidence, { action: "REJECT", reason: "missing_evidence" });
  assert.equal(execute.action, "EXECUTE");
});

test("score nunca executa sozinho", () => {
  const decision = decidePolicy({
    result: result({ type: "score", score: 99, confidence: 0.99 }),
    evidenceRefs: ["item"],
    critical: false,
  });
  assert.equal(decision.action, "REVIEW");
});

test("eval artificial do mock fecha accuracy 1", async () => {
  const raw = readFileSync("docs/jev/evals/cases.json", "utf8");
  const cases = JSON.parse(raw) as Array<{
    id: string;
    state: unknown;
    question: string;
    type: "noul" | "choice" | "score";
    options?: string[];
    evidenceRefs: string[];
    expected: TypedDecision;
  }>;
  const answers = Object.fromEntries(cases.map((item) => [item.id, item.expected]));
  const report = await evaluateCases(new MockProvider(answers), cases);
  assert.equal(report.cases, 3);
  assert.equal(report.accuracy, 1);
  assert.equal(report.provider, "mock");
  assert.ok(report.meanConfidence > 0.8);
  assert.ok(report.latencyMs >= 0);
});
