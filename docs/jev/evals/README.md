# Evals

Um caso é um JSON com:

- `id`
- `state`
- `question`
- `type` (`noul`, `choice` ou `score`)
- `options` quando `type` é `choice`
- `evidenceRefs`
- `expected` no mesmo formato do `TypedDecision`

`cases.json` nesta pasta tem três casos artificiais. `tests/decision.test.ts` roda o `MockProvider` contra eles e mede accuracy, confidence média, latência, provider e model.

Para um caso novo: acrescente o objeto no JSON e a resposta correspondente no mapa do provider de teste. Não conecte um modelo externo até existir uma fase que autorize isso.
