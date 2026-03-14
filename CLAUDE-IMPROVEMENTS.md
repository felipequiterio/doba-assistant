# Sugestoes de Melhoria — Doba Assistant

## 1. Expandir o numero de agents

A arquitetura de 4 modos no router (direct, single, multi-step, observe) aguenta muito mais do que os 2 agents atuais (todo + notes). Com tao poucos agents, o `planMultiStep` e `callAgentAndObserve` ficam subutilizados. Adicionar agents como calendario, lembretes, web search, e-mail, etc., daria mais sentido a orquestracao completa.

## 2. Retry com backoff nas chamadas LLM

Nao ha retry com exponential backoff nas chamadas ao LLM. Se o OpenRouter retornar timeout ou 429 (rate limit), o request morre sem tentativa de recuperacao. Implementar retry com backoff no nivel do `completeSimple` e `agent.prompt` aumentaria a resiliencia.

## 3. Observabilidade estruturada (tracing distribuido)

Os eventos via EventBus sao bons para streaming, mas nao ha tracing distribuido (OpenTelemetry ou similar). Com chamadas encadeadas (router -> agent -> tool), propagar um trace ID facilitaria debug e analise de performance em producao.

## 4. Validacao de output do router

O router depende do LLM escolher a tool correta. Se o modelo alucinar e chamar `planMultiStep` para algo simples, gasta tokens desnecessariamente. Um fallback pos-roteamento (ex: plano com 1 step -> converter para single) reduziria desperdicio de tokens e latencia.

## 5. Cobertura de testes

Atualmente so existe `smoke.test.ts`. A orquestracao e complexa o suficiente para justificar testes unitarios no router, runner e synthesis. Mocks do pi-agent-core permitiriam testar cada modo isoladamente sem depender de chamadas reais ao LLM.

## 6. Estrategia de erro no runPlan

Se um step do plano falha, o comportamento nao esta bem definido. Vale implementar uma estrategia explicita: abortar tudo, continuar com os demais steps, ou retry do step que falhou. Isso torna a execucao multi-step mais robusta.

## 7. Rate limiting por usuario

Nao ha throttling de requests. Um usuario enviando muitas mensagens em sequencia pode sobrecarregar o LLM provider. Um rate limiter simples no WebSocket handler (ex: token bucket por conexao) resolveria o problema.

## 8. Agent registry dinamico

Hoje os agents sao registrados de forma hardcoded no startup. Um sistema de plugins (carregar agents automaticamente de um diretorio, por exemplo) facilitaria a extensibilidade e permitiria adicionar novos agents sem modificar o codigo core.
