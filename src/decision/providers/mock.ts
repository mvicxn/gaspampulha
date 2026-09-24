import { resultOf } from "../evaluator.ts";
import type { DecisionProvider, DecisionQuestion, DecisionResult, TypedDecision } from "../types.ts";

export class MockProvider implements DecisionProvider {
  readonly name = "mock";
  readonly model = "deterministic-v1";
  private readonly answers: Record<string, TypedDecision>;

  constructor(answers: Record<string, TypedDecision>) {
    this.answers = answers;
  }

  decide(question: DecisionQuestion): Promise<DecisionResult> {
    const answer = this.answers[question.id];
    if (!answer) {
      return Promise.reject(new Error("mock_sem_resposta"));
    }
    return Promise.resolve(resultOf(question, answer, this));
  }
}
