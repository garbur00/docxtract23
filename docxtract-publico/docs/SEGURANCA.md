# Publicação e segurança do DocXtract

Esta cópia foi preparada para compartilhar o código-fonte. Ela não inclui arquivos `.env` reais, credenciais, dependências instaladas, builds antigos ou documentos de entrada e saída. As integrações continuam no código e exigem chaves próprias configuradas no servidor.

Endereços de APIs, nomes de variáveis e nomes de provedores são informações públicas. O que deve permanecer privado são os valores das chaves, senhas e os documentos processados. Tudo que o navegador recebe pode ser inspecionado por quem o utiliza.

## Antes de enviar ao GitHub

1. Trabalhe nesta pasta limpa, sem arrastar a pasta original inteira para o GitHub. Não copie `.env`, `node_modules`, `dist`, planilhas, PDFs, screenshots de clientes, logs ou checkpoints.
2. Mantenha os `.env.example` com campos de credenciais vazios. Preencha somente os `.env` locais ou os secrets do provedor de hospedagem. Nunca coloque chaves em `VITE_*`: o Vite incorpora essas variáveis ao código entregue ao navegador. [Documentação do Vite](https://vite.dev/guide/env-and-mode).
3. Use somente dados sintéticos para exemplos e demonstrações. Mesmo que um nome pareça fictício, não publique um recorte de documento real sem revisar todo o conteúdo e os metadados.
4. Se uma chave já foi publicada ou compartilhada fora do ambiente privado, revogue-a no provedor e gere outra. Excluir o arquivo depois não invalida a chave nem elimina cópias e histórico. [Orientação do GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Primeiro envio com Git

Os comandos abaixo são para uma pasta nova, sem histórico Git. Execute-os dentro da pasta `docxtract-publico` extraída do ZIP.

```powershell
git init -b main
git check-ignore backend/.env frontend/.env backend/.env.production
git add README.md .gitignore backend frontend tools docs
git status --short
git diff --cached --stat
```

O comando `check-ignore` deve listar os três caminhos privados. Antes do commit, confira se algum `.env` real entrou no Git:

```powershell
$taskTrackedEnv = git ls-files | Where-Object {
  $_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '(^|/)\.env\.example$'
}
if ($taskTrackedEnv) {
  throw 'Um arquivo de ambiente privado foi incluído. Remova-o do stage antes de continuar.'
}
git diff --cached
```

Revise o diff no seu terminal privado. Devem entrar apenas código, configurações públicas, ícones, testes sintéticos, documentação e exemplos vazios. O `.gitignore` previne inclusões futuras; ele não apaga um segredo de arquivos já rastreados e não filtra uploads manuais ou ZIPs.

Faça também uma verificação de segredos com uma ferramenta como Gitleaks, com relatório redigido, antes de enviar. Uma busca por padrões não garante detectar todo tipo de segredo. Não publique relatórios que contenham credenciais.

No GitHub, crie o repositório sem README automático. Substitua `SEU_USUARIO` pelo seu usuário; não coloque token na URL:

```powershell
git commit -m "Publica codigo do DocXtract sem configuracoes privadas"
git remote add origin https://github.com/SEU_USUARIO/docxtract.git
git push -u origin main
```

Confira o README, os arquivos e as configurações de segurança no GitHub. Mantenha secret scanning e push protection disponíveis para sua conta/repositório, e corrija os bloqueios em vez de ignorá-los. Essas proteções reconhecem formatos conhecidos e não substituem a revisão. [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).

Se quiser permitir reutilização do projeto, escolha uma licença e inclua seu arquivo. Não declare uma licença no README sem tê-la definido.

## Se o projeto já tinha sido publicado

Esta cópia nova não limpa commits, forks, releases ou ZIPs antigos. Primeiro revogue as credenciais expostas. Depois revise o histórico a publicar e siga o procedimento de remoção de dados sensíveis do GitHub. Não force alterações em um histórico compartilhado sem coordenar com os colaboradores.

## Antes de disponibilizar o aplicativo na internet

Código público e aplicativo acessível ao público exigem cuidados diferentes. Os itens abaixo ainda precisam de implementação ou validação antes de operar uma instância aberta com documentos e cobranças reais.

### Autenticação e cobrança

- A proteção existente é uma senha compartilhada opcional, desativada na configuração de desenvolvimento. A interface ainda não tem um fluxo de login conectado. Não habilite uma API pública contando apenas com CORS.
- Conecte o login à interface. `/api/access/login` limita falhas a 10 tentativas por IP em 15 minutos, mas a senha continua compartilhada. Para múltiplos usuários, implemente contas e sessões apropriadas.
- Configure HTTPS, quotas por usuário, limites de concorrência e orçamento no provedor. O limite atual por IP não é um teto financeiro. Restrinja os modelos e operações aceitos no backend.
- Para uma demonstração pública de portfólio, considere usar dados sintéticos e resultados pré-gerados, sem habilitar chamadas pagas anônimas.

### Separação e retenção de documentos

- O cache do servidor é global e as rotas acessam documentos por ID, sem validar proprietário. As estatísticas recentes também incluem identificadores e nomes de documentos. Implemente autorização por usuário e restrinja essas rotas antes de atender pessoas diferentes.
- Os IDs de documento são gerados no servidor com UUID, independentemente de `X-Request-ID`. IDs imprevisíveis não substituem a autorização por usuário.
- O navegador pode salvar resultados e nomes de arquivos em `localStorage`. A validade é verificada ao recuperar a sessão, sem limpeza automática garantida no prazo. Para dados sensíveis, desative essa persistência ou implemente consentimento, limpeza e uma política de retenção adequada.
- Imagens e textos podem ser enviados aos provedores de IA selecionados. Informe esse fluxo e use somente conteúdo apropriado à finalidade da demonstração.

### Dependências

- O processamento de PDF usa `pdfjs-dist 6.4.299`, com módulos e workers ESM. As leituras continuam com `isEvalSupported: false`. Mantenha biblioteca e worker na mesma versão e confira novos avisos antes de atualizar.
- SheetJS CE está em `0.20.3`, obtido pela distribuição oficial em vez da versão antiga do registro npm. Preserve a origem registrada nos manifests e lockfiles ao reinstalar. [Instalação oficial do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
- O frontend usa Vite 8 e o backend usa Zod 4. Use Node.js 22.13+ ou 24 LTS e rode auditoria nos dois pacotes. O arquivo Netlify desta cópia indica Node 24; confira a compatibilidade ao atualizar. [Ciclo de suporte do Node.js](https://nodejs.org/en/about/previous-releases).

```powershell
npm --prefix backend audit
npm --prefix frontend audit
```

## Proteções aplicadas nesta cópia

- Arquivos privados e artefatos gerados excluídos do pacote, com `.gitignore` abrangente.
- Exemplos de ambiente com chaves e senhas vazias; credenciais continuam no backend.
- Dados dos fixtures substituídos por valores sintéticos e caminhos pessoais removidos dos scripts auxiliares.
- Autenticação Gemini enviada por header, sem chave no querystring da URL. [Referência da API](https://ai.google.dev/api).
- Remoção de partes de chaves dos avisos de configuração e redação de segredos conhecidos em erros. Erros internos em produção não registram o objeto bruto no handler global.
- Limite de falhas de login por IP e IDs de documentos gerados independentemente do cabeçalho de rastreamento.
- Respostas de `/api` usam `Cache-Control: no-store`; isso não substitui autorização ou a política de retenção do aplicativo.
- PDF.js, Vite, Zod e SheetJS atualizados, com testes e build necessários para conferir a compatibilidade. Essas medidas não garantem ausência de todas as vulnerabilidades.

## Verificação local e limites da análise

`npm test` executa os arquivos `*.test.js` em processos separados, remove credenciais herdadas do ambiente e impede o carregamento do `.env` do desenvolvedor pelo caminho padrão do dotenv. O preload bloqueia chamadas externas por `fetch` e permite apenas HTTP local para os testes de integração. Os provedores de IA são simulados; nenhuma chave real é necessária para essa suíte. Execute os testes pelo comando documentado para manter esse isolamento.

A aprovação de build, testes e varredura não comprova ausência de todas as vulnerabilidades. A análise desta cópia não verifica histórico remoto, forks, exposições anteriores, políticas da hospedagem ou permissões de contas externas.
