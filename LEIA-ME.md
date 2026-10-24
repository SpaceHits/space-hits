# Space Hits · by Space Media · versão 0.2 (campo único)

Cole o link de um vídeo que deu certo (Instagram, TikTok ou YouTube) e receba o Raio-X, 3 novos Reels e um carrossel.

## Como funciona por dentro

1. **Página** (`public/index.html`): o campo único, o andamento, o resultado, o teleprompter, perfis e histórico.
2. **Motor** (`netlify/functions`):
   - `iniciar` recebe o link e cria uma tarefa;
   - `processar-background` busca o vídeo (Apify), assiste e transcreve (Gemini) e escreve os roteiros (Claude, ou Gemini se não houver chave da Anthropic);
   - `status` informa a página sobre o andamento.
3. As tarefas ficam guardadas no Netlify Blobs (já incluso na Netlify, sem configurar nada).

## Chaves (variáveis de ambiente na Netlify)

| Variável | Obrigatória? | Onde pegar |
|---|---|---|
| `GEMINI_API_KEY` | Sim | aistudio.google.com → Get API key |
| `APIFY_TOKEN` | Sim, para Instagram e TikTok | apify.com → Settings → API & Integrations |
| `ANTHROPIC_API_KEY` | Recomendada (roteiros melhores) | console.anthropic.com → API Keys |
| `CODIGO_ACESSO` | Recomendada | Invente um código (ex.: `beta2026`). Vários separados por vírgula. Sem ele, qualquer pessoa com o link gasta seus créditos. |
| `GEMINI_MODEL` | Não | Padrão: `gemini-3.8-flash` |
| `CLAUDE_MODEL` | Não | Padrão: `claude-sonnet-5-5` |

## Trocar o nome do produto

Em `public/index.html`, mude a linha `const APP = "Space Hits";` e o `<title>`.
