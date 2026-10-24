# DocXtract

Web application that extracts and organizes data from **PDFs, images, and DOCX files** using artificial intelligence. Review the results and export them to **Excel or JSON**.

[English](#docxtract) · [Português](#portugues)

## Features

- Reads digital PDFs, scanned documents, JPG, PNG, WebP, and DOCX files.
- Integrates with Gemini, Claude, and OpenAI through the backend.
- Lets you review and edit extracted data before exporting.
- Consolidates multiple pages and flags partial results.
- Generates spreadsheets with fields and columns adapted to the extracted content.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | JavaScript, React 18, and Vite 8 |
| Backend | Node.js and Express |
| Document processing | PDF.js 6 and Mammoth |
| Spreadsheets | SheetJS CE 0.20.3 |
| Validation | Zod 4 |
| AI | Gemini, Anthropic Claude, and OpenAI APIs |

The project uses JavaScript with ES modules. Temporary server results are stored in memory; this version does not use a persistent database.

## Use your own API keys

This repository provides the source code without credentials or a public API hosted by the author. To try it, download or clone the project, run it on your computer, and configure your own keys in `backend/.env`. Usage quotas and any charges belong to the account running the application.

The `.env.example` files are configuration templates with empty credential fields. Never include your `.env` in commits, issues, pull requests, or screenshots.

## Getting started

Requirements: Node.js 22.13+ or 24 LTS, npm, and your own AI provider credentials.

From the project root, using PowerShell:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Add your API keys only to `backend/.env`. Configure Gemini for the main PDF and image workflow. Claude or OpenAI are also used for DOCX processing and review, depending on the selected mode. API calls may incur provider charges.

For local development, set `VITE_API_URL=http://localhost:3001` in the frontend configuration. This URL is public; never put passwords or API keys in `VITE_*` variables.

Start the services in two separate terminals:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Open `http://localhost:5173`. The backend API runs at `http://localhost:3001`.

## Project structure

```text
backend/     API, AI integrations, validation, and Excel generation
frontend/    Interface, file reading, and result review
tools/       Batch processing utilities
docs/        Security and publishing guides
```

## Build and tests

```powershell
npm --prefix frontend run build
npm --prefix backend test
```

Local tests do not require `.env` configuration. The test runner removes inherited credentials and blocks external `fetch` requests; loopback requests remain available for API integration tests. See the notes in the [security guide](docs/SEGURANCA.md), available in Portuguese.

## Limitations and privacy

AI extraction can make mistakes; review the results before using them. In this version, the DOCX workflow processes up to 12,000 characters. Document content may be sent to the selected AI providers.

This repository does not include keys or passwords. Local setup does not make the application ready for public access: review the [production security requirements](docs/SEGURANCA.md) before hosting it on the internet. The guide is available in Portuguese.

<a id="portugues"></a>

<details>
<summary><strong>Português — tradução completa</strong></summary>

## Sobre o projeto

Aplicação web que extrai e organiza dados de **PDFs, imagens e arquivos DOCX** com apoio de inteligência artificial. Permite revisar os resultados e exportá-los para **Excel ou JSON**.

## Recursos

- Leitura de PDFs digitais, documentos escaneados, JPG, PNG, WebP e DOCX.
- Integrações com Gemini, Claude e OpenAI, configuradas no backend.
- Revisão e edição dos dados antes da exportação.
- Consolidação de múltiplas páginas e sinalização de resultados parciais.
- Planilhas com campos e colunas adaptados ao conteúdo extraído.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Frontend | JavaScript, React 18 e Vite 8 |
| Backend | Node.js e Express |
| Documentos | PDF.js 6 e Mammoth |
| Planilhas | SheetJS CE 0.20.3 |
| Validação | Zod 4 |
| IA | APIs de Gemini, Anthropic Claude e OpenAI |

O projeto usa JavaScript com ES modules. Os resultados temporários do servidor ficam em memória; não há banco de dados persistente nesta versão.

## Uso com chaves próprias

Este repositório disponibiliza o código-fonte, sem credenciais ou uma API pública mantida pelo autor. Para testar, baixe ou clone o projeto, execute-o no seu computador e configure suas próprias chaves em `backend/.env`. As cotas e eventuais custos pertencem à conta de quem executar.

Os arquivos `.env.example` são modelos de configuração com os campos de credenciais vazios. Não envie seu `.env` para commits, issues, pull requests ou screenshots.

## Como executar

Pré-requisitos: Node.js 22.13+ ou 24 LTS, npm e credenciais próprias dos provedores de IA.

Na raiz do projeto, usando PowerShell:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Preencha as chaves somente em `backend/.env`. Para o fluxo principal de PDFs e imagens, configure Gemini. Claude ou OpenAI também são usados para DOCX e revisão, conforme o modo selecionado. As chamadas podem gerar cobrança no provedor.

No frontend, use `VITE_API_URL=http://localhost:3001` em desenvolvimento. Essa URL é pública; não coloque senhas ou chaves em variáveis `VITE_*`.

Inicie os serviços em dois terminais:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Acesse `http://localhost:5173`. A API fica em `http://localhost:3001`.

## Estrutura

```text
backend/     API, integrações de IA, validação e geração de Excel
frontend/    Interface, leitura de arquivos e revisão dos resultados
tools/       Scripts auxiliares para processamento em lote
docs/        Orientações de segurança e publicação
```

## Build e testes

```powershell
npm --prefix frontend run build
npm --prefix backend test
```

Não é necessário preencher o `.env` para rodar os testes locais. O executor remove credenciais herdadas e bloqueia chamadas externas por `fetch`; chamadas locais continuam disponíveis para testes de integração da API. Consulte as observações em [segurança](docs/SEGURANCA.md).

## Limitações e privacidade

A extração por IA pode errar; revise os resultados antes de usá-los. O fluxo DOCX desta versão considera até 12.000 caracteres. O conteúdo processado pode ser enviado aos provedores de IA selecionados.

Chaves e senhas não acompanham este repositório. A configuração local não torna o aplicativo pronto para acesso público: consulte [os ajustes necessários para produção](docs/SEGURANCA.md) antes de disponibilizar uma instância na internet.

</details>
