import {
  choiceAnswerKeys,
  decisionResultKeys,
  noulAnswerKeys,
  PROBABILITY_SUM_TOLERANCE,
  scoreAnswerKeys,
} from "./schema.ts";
import type { DecisionResult, TypedDecision } from "./types.ts";

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): string | null {
  const present = Object.keys(value);
  const missing = keys.filter((key) => !present.includes(key));
  const extra = present.filter((key) => !keys.includes(key));
  if (missing.length > 0) return `faltam campos: ${missing.join(",")}`;
  if (extra.length > 0) return `campos inesperados: ${extra.join(",")}`;
  return null;
}

function unitInterval(value: unknown, label: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${label} fora de [0,1]`);
  }
}

function validateAnswer(type: unknown, answer: unknown, errors: string[]): TypedDecision | null {
  if (!isRecord(answer)) {
    errors.push("answer inválido");
    return null;
  }
  if (type === "noul") {
    const shape = exactKeys(answer, noulAnswerKeys);
    if (shape) errors.push(shape);
    if (answer.type !== "noul") errors.push("answer.type diferente de noul");
    if (typeof answer.answer !== "boolean") errors.push("answer.answer não é boolean");
    unitInterval(answer.probability, "probability", errors);
    unitInterval(answer.confidence, "confidence", errors);
  } else if (type === "choice") {
    const shape = exactKeys(answer, choiceAnswerKeys);
    if (shape) errors.push(shape);
    if (answer.type !== "choice") errors.push("answer.type diferente de choice");
    if (typeof answer.choice !== "string" || answer.choice.length === 0) {
      errors.push("choice vazio");
    }
    if (!isRecord(answer.probabilities)) {
      errors.push("probabilities inválido");
    } else {
      const entries = Object.entries(answer.probabilities);
      if (entries.length < 2) errors.push("choice exige ao menos duas opções");
      let sum = 0;
      for (const [option, probability] of entries) {
        unitInterval(probability, `probabilities.${option}`, errors);
        if (typeof probability === "number") sum += probability;
      }
      if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) {
        errors.push("probabilities não somam 1");
      }
      if (typeof answer.choice === "string" && !(answer.choice in answer.probabilities)) {
        errors.push("choice fora de probabilities");
      }
    }
    unitInterval(answer.confidence, "confidence", errors);
  } else if (type === "score") {
    const shape = exactKeys(answer, scoreAnswerKeys);
    if (shape) errors.push(shape);
    if (answer.type !== "score") errors.push("answer.type diferente de score");
    if (
      typeof answer.score !== "number" ||
      !Number.isInteger(answer.score) ||
      answer.score < 0 ||
      answer.score > 100
    ) {
      errors.push("score fora de 0..100");
    }
    unitInterval(answer.confidence, "confidence", errors);
  } else {
    errors.push("type inválido");
    return null;
  }
  return errors.length === 0 ? (answer as unknown as TypedDecision) : null;
}

export function validateDecisionResult(input: unknown): Validation<DecisionResult> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["resultado não é objeto"] };
  const shape = exactKeys(input, decisionResultKeys);
  if (shape) errors.push(shape);
  if (typeof input.questionId !== "string" || input.questionId.length === 0) {
    errors.push("questionId vazio");
  }
  if (input.type !== "noul" && input.type !== "choice" && input.type !== "score") {
    errors.push("type inválido");
  }
  if (typeof input.provider !== "string" || input.provider.length === 0) {
    errors.push("provider vazio");
  }
  if (typeof input.model !== "string" || input.model.length === 0) {
    errors.push("model vazio");
  }
  if (typeof input.createdAt !== "string" || Number.isNaN(Date.parse(input.createdAt))) {
    errors.push("createdAt inválido");
  }
  const answer = validateAnswer(input.type, input.answer, errors);
  if (!answer || errors.length > 0) return { ok: false, errors };
  if (answer.type !== input.type) {
    return { ok: false, errors: ["type não bate com answer.type"] };
  }
  return { ok: true, value: input as unknown as DecisionResult };
}
