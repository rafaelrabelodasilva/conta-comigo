# Conta Comigo

App para dividir a fatura do cartão de crédito entre as pessoas que compram no seu cartão.

Todo mês: importa o PDF da fatura, extrai os lançamentos (à vista, parcelados e estornos), atribui um responsável a cada despesa e gera o valor final de cada pessoa, pronto para mandar no WhatsApp.

## Como o projeto é construído

Este projeto usa o [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (v6) para planejar e desenvolver com agentes de IA:

- `_bmad/`: módulos e configuração do BMAD
- `.claude/skills/`: skills do BMAD para o Claude Code
- `_bmad-output/`: documentos gerados (brief, PRD, arquitetura, histórias)

Para começar no Claude Code, abra esta pasta e rode `/bmad-help`.
