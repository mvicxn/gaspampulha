# Protocolo

```text
STATE → QUESTION → TYPED DECISION → PROBABILITIES → POLICY → ACTION / REVIEW
```

O modelo fornece a decisão. O código governa a consequência.

- Probabilidade não é prova.
- Confidence não é garantia e não autoriza execução sozinha.
- Hard rule tem precedência sobre a decisão probabilística.
- Ação crítica exige evidência (`evidenceRefs` não vazio) além do limiar de probabilidade.
- Resultado que não passa no validador é `REJECT`.
- Decisão sem schema não entra no pipeline.
- `score` não produz `EXECUTE`.

Limiares em `src/decision/policy.ts`: executar a partir de 0,90 de probabilidade na opção escolhida; revisar a partir de 0,60; score revisa a partir de 80.

Providers futuros implementam `DecisionProvider` em `src/decision/providers/types.ts`. O workflow e a policy não mudam quando o provider mudar.
