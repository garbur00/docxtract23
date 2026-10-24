# Ferramentas de processamento em lote

Utilitários locais para PDFs digitais, com texto selecionável. Eles usam o pipeline do DocXtract e chamam a API do Gemini diretamente; não precisam do servidor HTTP em execução.

## Preparação

1. Instale as dependências de `backend` e `frontend` conforme o README da raiz.
2. Crie `backend/.env` a partir de `backend/.env.example` e preencha `GEMINI_API_KEY` apenas no arquivo local.
3. Use um PDF sintético ou autorizado. O texto extraído será enviado ao provedor de IA e as chamadas podem gerar cobrança.

Defina `DOCX_PDF` antes de executar. Sem essa variável, os dois scripts encerram com uma mensagem de configuração, sem processar páginas.

Exemplo no PowerShell, a partir da raiz do projeto:

```powershell
$env:DOCX_PDF = (Resolve-Path '.\amostra-sintetica.pdf').Path
$env:DOCX_OUTPUT_DIR = '.\private-output\piloto'
```

Substitua `amostra-sintetica.pdf` pelo arquivo de teste escolhido. Caminhos relativos são resolvidos a partir do diretório atual do terminal.

## Extração em lote

```powershell
node tools/extrair_lote.mjs 1-10 --par=1 --so-barato --max=5
```

| Opção | Efeito |
| --- | --- |
| `1-10` | Processa o intervalo indicado; sem intervalo, processa todas as páginas. |
| `--par=N` | Quantidade de páginas em paralelo: padrão 8, máximo 20. |
| `--so-barato` | Mantém o modelo configurado como econômico, sem escalonamento. |
| `--max=N` | Interrompe quando a estimativa acumulada alcança N reais. Sem essa opção, não há teto no script. |

O diretório de saída vem de `DOCX_OUTPUT_DIR`; sem essa variável, o padrão é `./private-output`. O script cria a pasta automaticamente e grava:

- `DocXtract_lote.xlsx`: planilha consolidada.
- `DocXtract_lote.checkpoint.json`: resultados extraídos e progresso para retomada.
- `DocXtract_lote.log.txt`: eventos e erros, quando houver.

Para retomar o mesmo PDF, execute novamente com o mesmo diretório de saída. **Use uma pasta de saída diferente para cada documento**: o checkpoint é reutilizado pelo nome fixo e não identifica automaticamente se o PDF foi trocado.

Os preços, câmbio e modelos definidos nos scripts são referências de cálculo e podem ficar desatualizados. O `--max` é uma estimativa local: chamadas simultâneas ou já iniciadas podem ultrapassar o valor. Configure também os limites disponíveis na conta do provedor e acompanhe o consumo.

## Comparação de modelos

```powershell
node tools/comparar_modelos.mjs 1-10
```

Processa o mesmo intervalo com cada modelo e mostra no terminal concordância de campos, tokens, tempo e estimativa de custo. O padrão sem argumento é `1-10`. Cada modelo faz suas próprias chamadas e consome cota, podendo gerar cobrança conforme a conta.

Esse comparador não grava arquivos; `DOCX_OUTPUT_DIR` é usado pelo extrator em lote. Concordância entre modelos não comprova a exatidão dos dados: confira uma amostra manualmente.

## Cuidados antes de publicar

- Nunca inclua `backend/.env`, chaves, documentos reais ou resultados privados no GitHub.
- Mantenha `private-output/` fora do Git. Caso personalize `DOCX_OUTPUT_DIR` dentro do repositório, ignore também a pasta escolhida.
- O checkpoint contém dados extraídos; planilhas e logs também devem ser tratados como privados.
- Revise os arquivos selecionados para commit e use apenas dados sintéticos em exemplos, testes e capturas de tela.
- Não execute estas ferramentas automaticamente em workflows de pull requests externos com acesso às suas credenciais.
