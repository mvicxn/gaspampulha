export const PROBABILITY_SUM_TOLERANCE = 0.001;

export const decisionResultKeys = [
  "questionId",
  "type",
  "answer",
  "provider",
  "model",
  "createdAt",
] as const;

export const noulAnswerKeys = ["type", "answer", "probability", "confidence"] as const;
export const choiceAnswerKeys = ["type", "choice", "probabilities", "confidence"] as const;
export const scoreAnswerKeys = ["type", "score", "confidence"] as const;
