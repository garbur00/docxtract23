# Publicar o DocXtract sem suas chaves

Este passo a passo publica somente o código-fonte. Quem quiser testar executará o projeto no próprio computador e configurará as próprias credenciais. Você não precisa fornecer uma chave, hospedar uma API de demonstração ou adicionar credenciais aos secrets do GitHub para essa finalidade.

## Cobrança do Gemini

Conferência em 24 de outubro de 2026: no Free Tier, os modelos elegíveis têm limites gratuitos. Ao atingir um limite, as chamadas são recusadas, normalmente com HTTP 429; atingir a cota não configura faturamento nem migra automaticamente o projeto para o nível pago. A passagem ao nível pago exige configurar faturamento. Um projeto que já esteja no nível pago pode gerar cobrança conforme seu plano, mesmo que você o considere apenas um teste. [Cobrança](https://ai.google.dev/gemini-api/docs/billing), [cotas](https://ai.google.dev/gemini-api/docs/rate-limits), [erros de API](https://ai.google.dev/gemini-api/docs/api-errors).

Para verificar sua própria situação, entre no Google AI Studio, abra **Projects** e consulte a coluna **Billing Tier** do projeto associado à sua chave. Confira também **Billing** e os limites ativos. A documentação pública não informa a configuração da sua conta.

Publicar este código sem credenciais não permite que leitores utilizem sua cota. Essa conclusão pressupõe que suas chaves não tenham sido expostas em outro local e que você não ofereça um backend público conectado à sua conta. Se uma chave já vazou, revogue-a no provedor.

## Passo a passo pelo navegador

### 1 Baixe e extraia a cópia limpa

Extraia `DocXtract_GitHub.zip` em uma pasta nova. Use a pasta interna `docxtract-publico`, que já contém o README, o `.gitignore`, os testes sintéticos e os modelos de configuração.

Não misture a pasta original, seus arquivos de trabalho ou seus `.env` nessa cópia de publicação. O ZIP contém código; envie os arquivos extraídos, não apenas o ZIP como um arquivo único no repositório.

### 2 Confira a pasta antes do envio

A estrutura na raiz deve conter:

```text
README.md
.gitignore
backend/
frontend/
tools/
docs/
```

`backend/.env.example` e `frontend/.env.example` podem ser publicados: são modelos sem credenciais reais. Não inclua `.env`, documentos pessoais, planilhas extraídas, logs, checkpoints, `node_modules` ou `dist`.

O upload manual pelo navegador não deve ser tratado como protegido pelo `.gitignore`; confira os arquivos escolhidos. Esse arquivo serve principalmente para o fluxo com Git.

### 3 Crie um repositório vazio

No GitHub, abra **New repository**, escolha seu usuário como proprietário, use o nome `docxtract` ou outro nome disponível e selecione **Public**.

Não marque as opções de criar README, `.gitignore` ou licença nesse primeiro momento, pois o pacote já inclui os dois primeiros. Clique em **Create repository**. [Instruções oficiais](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).

Descrição sugerida para o campo About:

> Extração de dados de PDFs, imagens e DOCX para Excel e JSON com IA, React e Node.js. Execução local com chaves próprias.

Deixe o campo de site sem um endereço de API pessoal. Não é necessário ativar GitHub Pages ou configurar Netlify/Railway para publicar apenas o código.

### 4 Envie os arquivos extraídos

Na página do repositório vazio, use **uploading an existing file**. Se o repositório já tiver uma lista de arquivos, o caminho é **Add file → Upload files**.

Arraste o conteúdo de `docxtract-publico` para a área de upload: o README e o `.gitignore` devem ficar na raiz, ao lado das pastas. Aguarde todos os arquivos carregarem. Essa cópia tem menos de 100 arquivos e cada arquivo está abaixo do limite de tamanho do upload web. [Upload pelo GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

Se o navegador não incluir o `.gitignore`, adicione esse arquivo separadamente. Antes de confirmar, confira que os únicos arquivos de ambiente são os dois `.env.example`.

### 5 Confirme o primeiro commit

Use uma mensagem como `Publica codigo do DocXtract com configuracao por usuario` e confirme o envio. Dependendo da tela, a ação aparece como **Commit changes** ou **Propose changes**; se for criada uma pull request, revise os arquivos e conclua o merge para a branch principal.

Depois abra a página inicial do repositório. O README deve aparecer automaticamente, com a seção **Uso com chaves próprias** e os comandos de instalação.

### 6 Confira a publicação

- Confira README, `.gitignore` e os dois `.env.example`.
- Mantenha os recursos de secret scanning e push protection disponíveis para sua conta/repositório. Corrija alertas de segredos antes de prosseguir.
- Não adicione suas chaves em arquivos, exemplos, issues, screenshots ou configurações públicas. Para a publicação somente do código, não é preciso adicionar chaves a GitHub Actions.
- Se quiser permitir reutilização do código, defina uma licença e adicione seu arquivo. Não declare uma licença que ainda não escolheu.

Se o repositório já continha credenciais, reenviar uma cópia limpa não apaga o histórico antigo. Consulte [a remoção de dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Como as outras pessoas testarão

O visitante baixa pelo botão **Code → Download ZIP** ou clona o repositório. Depois segue o README:

1. Instala Node.js e as dependências de `backend` e `frontend`.
2. Copia os `.env.example` para `.env`, somente no próprio computador.
3. Configura as próprias chaves no `backend/.env` e verifica as cotas e a cobrança da própria conta.
4. Inicia backend e frontend e acessa o endereço local informado no README.

Gemini atende ao fluxo principal de PDFs e imagens. O fluxo DOCX desta versão também exige Claude ou OpenAI. O projeto ainda não tem uma interface para visitantes inserirem chaves em um site hospedado; o procedimento descrito é para execução local.

Os cuidados para uma futura instância pública estão em [segurança](SEGURANCA.md). Eles não são necessários para simplesmente disponibilizar o código, mas continuam relevantes caso você decida oferecer o aplicativo online.
