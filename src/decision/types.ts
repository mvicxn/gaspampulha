export type DecisionType = "noul" | "choice" | "score";

export interface NoulDecision {
  type: "noul";
  answer: boolean;
  probability: number;
  confidence: number;
}

export interface ChoiceDecision {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreDecision {
  type: "score";
  score: number;
  confidence: number;
}

export type TypedDecision = NoulDecision | ChoiceDecision | ScoreDecision;

export interface DecisionQuestion {
  id: string;
  type: DecisionType;
  prompt: string;
  state: unknown;
  options?: string[];
  evidenceRefs: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface DecisionResult {
  questionId: string;
  type: DecisionType;
  answer: TypedDecision;
  provider: string;
  model: string;
  createdAt: string;
}

export interface DecisionProvider {
  readonly name: string;
  readonly model: string;
  decide(question: DecisionQuestion): Promise<DecisionResult>;
}
