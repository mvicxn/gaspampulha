# Decision Engine

Motor próprio deste projeto para decisões tipadas. Não é o modelo proprietário de nenhum fornecedor.

O provider devolve um resultado no contrato `noul`, `choice` ou `score`. O validador recusa o que não passa no schema. A policy, em código, escolhe `EXECUTE`, `REVIEW` ou `REJECT`.

Nesta fase o único provider é o `MockProvider`. Não há chamada a OpenAI, Anthropic, Gemini ou outro modelo.

Contrato e pipeline: [protocol.md](./protocol.md).

Casos artificiais: [evals/](./evals/).
