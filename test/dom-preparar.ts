// Preparo dos testes de componente com DOM. Carregado por `setupFiles` em
// todos os arquivos, mas só faz algo nos que pedem jsdom
// (`// @vitest-environment jsdom`): no ambiente `node` não há `document` e a
// Testing Library nem é importada. Sem `globals` no Vitest, a limpeza
// automática da Testing Library não liga sozinha; aqui ela roda depois de
// cada teste.
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
