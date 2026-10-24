import { ErroAmigavel } from "./fontes.mjs";

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Modelo reserva, usado quando o principal está sobrecarregado (erro 503).
const GEMINI_RESERVA = () => process.env.GEMINI_MODEL_RESERVA || "gemini-3.6-flash";
const esperar = ms => new Promise(r => setTimeout(r, ms));
const CLAUDE_MODEL = () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// Extrai o primeiro objeto JSON de uma resposta (tolera cercas ```json).
export function lerJSON(texto) {
  const t = String(texto || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i >= 0 && f > i) { try { return JSON.parse(t.slice(i, f + 1)); } catch {} }
  throw new ErroAmigavel("A IA devolveu uma resposta incompleta. Tente de novo.");
}

// Chama o Gemini com novas tentativas: 503/500/429 são sobrecarga temporária do Google.
async function gemini(partes, opcoes = {}) {
  const modelos = [GEMINI_MODEL(), GEMINI_MODEL(), GEMINI_RESERVA(), GEMINI_RESERVA()];
  const pausas = [0, 4000, 2000, 8000];
  let ultimo;
  for (let i = 0; i < modelos.length; i++) {
    if (pausas[i]) await esperar(pausas[i]);
    try { return await geminiUmaVez(modelos[i], partes, opcoes); }
    catch (e) { ultimo = e; if (!e.temporario) throw e; }
  }
  throw new ErroAmigavel("O Gemini (Google) está sobrecarregado agora. Espere um ou dois minutos e tente de novo.");
}

async function geminiUmaVez(modelo, partes, { json = true, temperatura = 0.7 } = {}) {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new ErroAmigavel("Falta configurar a variável GEMINI_API_KEY na Netlify.");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: partes }],
      generationConfig: { temperature: temperatura, maxOutputTokens: 16384, ...(json ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (corpo.error && corpo.error.message) || "";
    console.error("Gemini", modelo, r.status, m.slice(0, 300));
    if ([429, 500, 502, 503, 504].includes(r.status)) { const e = new Error("temporario"); e.temporario = true; throw e; }
    if (r.status === 404) { const e = new Error("modelo"); e.temporario = true; throw e; } // modelo indisponível: tenta o reserva
    if ((r.status === 400 || r.status === 403) && /api key|permission/i.test(m)) throw new ErroAmigavel("A chave do Gemini foi recusada. Confira GEMINI_API_KEY na Netlify.");
    if (/private|unlisted|not.*public|unavailable video/i.test(m)) throw new ErroAmigavel("Esse vídeo do YouTube não é público. Só dá para ler vídeos públicos.");
    throw new ErroAmigavel("O Gemini não conseguiu processar o vídeo (" + r.status + ").");
  }
  const texto = (corpo.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!texto) throw new ErroAmigavel("O Gemini não devolveu nada para esse vídeo.");
  return texto;
}

// 1) Assistir o vídeo: transcrição + o que acontece na tela.
export async function assistirVideo({ youtubeUrl, video }) {
  const instrucao = `Assista ao vídeo inteiro e responda SOMENTE com JSON neste formato:
{
  "transcricao": "tudo o que é falado, palavra por palavra, em ordem, no idioma original",
  "gancho_visual": "o que aparece e acontece na tela nos 3 primeiros segundos (enquadramento, ação, objeto, expressão)",
  "textos_na_tela": "textos escritos sobrepostos no vídeo, em ordem, separados por ' | '",
  "ritmo_edicao": "como é a edição: quantidade de cortes, B-roll, legendas, música, duração aproximada",
  "tem_fala": true
}
Se o vídeo não tiver fala, deixe "transcricao" vazio, "tem_fala": false, e descreva bem a sequência visual em "ritmo_edicao".`;
  const midia = youtubeUrl
    ? { file_data: { file_uri: youtubeUrl } }
    : { inline_data: { mime_type: video.tipo, data: video.base64 } };
  const r = lerJSON(await gemini([midia, { text: instrucao }], { temperatura: 0.2 }));
  return {
    transcricao: String(r.transcricao || "").trim(),
    gancho_visual: String(r.gancho_visual || ""),
    textos_na_tela: String(r.textos_na_tela || ""),
    ritmo_edicao: String(r.ritmo_edicao || ""),
    tem_fala: r.tem_fala !== false,
  };
}

// 2) Escrever os roteiros. Usa Claude se houver chave; senão, Gemini.
export async function escreverRoteiros(prompt) {
  if (process.env.ANTHROPIC_API_KEY) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) throw new ErroAmigavel("A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY na Netlify.");
      if (r.status === 429 || r.status === 529) throw new ErroAmigavel("O Claude está sobrecarregado agora. Tente de novo em um minuto.");
      if (r.status === 400 && /credit/i.test(JSON.stringify(corpo))) throw new ErroAmigavel("Os créditos da API da Anthropic acabaram.");
      throw new ErroAmigavel("O Claude não conseguiu escrever os roteiros (" + r.status + ").");
    }
    const texto = (corpo.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return { dados: lerJSON(texto), motor: "claude" };
  }
  return { dados: lerJSON(await gemini([{ text: prompt }], { temperatura: 0.9 })), motor: "gemini" };
}

const fmt = n => (n == null ? null : Number(n).toLocaleString("pt-BR"));

export function montarPrompt({ perfil = {}, video, fonte = {} }) {
  const m = fonte.metricas || {};
  const metricas = [
    m.visualizacoes && fmt(m.visualizacoes) + " visualizações",
    m.curtidas && fmt(m.curtidas) + " curtidas",
    m.comentarios && fmt(m.comentarios) + " comentários",
    m.compartilhamentos && fmt(m.compartilhamentos) + " compartilhamentos",
  ].filter(Boolean).join(", ");
  const temPerfil = perfil && (perfil.nicho || perfil.publico || perfil.tom);

  return `# PAPEL E OBJETIVO
Você é um Diretor Criativo e Estrategista Sênior de vídeos curtos (Reels/TikTok/Shorts) e Copywriter de Retenção, escrevendo em português do Brasil.
Sua especialidade é fazer engenharia reversa de vídeos de alta performance (vídeos campeões) e multiplicar sua estrutura persuasiva em conteúdos inéditos, mantendo o mesmo gatilho psicológico, ritmo e lógica de retenção, mas mudando ângulos e exemplos para não parecer conteúdo repetido.

# REGRAS DE ESCRITA
1. PROIBIDO usar clichês de IA: "No mundo acelerado de hoje", "Descubra o segredo", "Mergulhe", "Desvende", "É crucial", "Olá pessoal, tudo bem?", "Você sabia que...". Nada de introduções.
2. O GANCHO (primeiros 3 segundos) começa direto na ação, na dor, na quebra de expectativa ou numa afirmação contraintuitiva. Máximo 12 palavras.
3. Escreva para ser FALADO: frases curtas, palavras do dia a dia, ritmo de conversa.
4. Respeite o tom de voz, o vocabulário e a postura do perfil. Não invente dados, preços, nomes de pessoas ou resultados numéricos que não estejam no vídeo original.
5. Não copie frases do vídeo original: reaproveite a ESTRUTURA, não o texto.
6. Direções visuais simples de gravar com celular (B-roll de rotina, ação física, texto curto na tela). Aproveite o que funcionou visualmente no original.
7. Texto na tela: no máximo 7 palavras.

# ENGENHARIA REVERSA (faça antes de escrever)
Analise a fala, o gancho visual, os textos na tela e o ritmo de edição. Identifique a anatomia do gancho, a estrutura de retenção, o ritmo e o fechamento (CTA).
${temPerfil ? "" : "O perfil do criador não foi informado: deduza nicho, público e tom de voz a partir do próprio vídeo e da legenda, e mantenha esse jeito de falar.\n"}
# 3 VARIAÇÕES DE REELS (mesma estrutura de sucesso, ângulos diferentes)
- Variação 1, ângulo "Erro Oculto / Alerta": o que o público faz achando que está certo, mas piora o problema.
- Variação 2, ângulo "Mito vs. Realidade": quebra uma crença comum do nicho na primeira frase.
- Variação 3, ângulo "Prático / Bastidor / Caso Real": mostra a solução em ação ("Quando alguém chega aqui com X, a primeira coisa que fazemos não é Y, é Z").
Cada Reel tem exatamente 4 blocos: GANCHO (0-3s), DESENVOLVIMENTO / RETENÇÃO, VIRADA / SOLUÇÃO, CTA (CHAMADA PARA AÇÃO).

# CARROSSEL (exatamente 6 slides)
1: headline magnética + subtítulo. 2: contexto do problema (identificação). 3: erro comum ou causa raiz. 4: a virada / método em passos. 5: resumo salvável (checklist ou "Faça isso / Evite aquilo"). 6: conclusão + CTA.

# FORMATO DE SAÍDA
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, neste esquema:
{
  "raio_x_campeao": {"tipo_gancho": "nome curto da técnica", "por_que_funcionou": "2 frases sobre o gatilho psicológico", "formula_estrutural": "Etapa → Etapa → Etapa → CTA", "nicho_detectado": "nicho em poucas palavras"},
  "variacoes_reels": [
    {"id": 1, "angulo": "Erro Oculto / Alerta", "titulo_interno": "título curto", "tempo_estimado": "35-45 segundos",
     "blocos_roteiro": [{"etapa": "GANCHO (0-3s)", "cena_visual": "...", "texto_tela": "...", "fala": "..."}],
     "texto_teleprompter": "só as falas, na ordem, separadas por linha em branco",
     "sugestao_legenda": "legenda curta + 3 hashtags"}
  ],
  "carrossel": {"titulo_ideia": "...", "slides": [{"numero_slide": 1, "titulo_slide": "...", "texto_apoio": "...", "sugestao_visual": "..."}], "legenda_carrossel": "..."}
}

# PERFIL DO CRIADOR
- Nome/Marca: ${perfil.nome || (fonte.autor ? "@" + fonte.autor : "não informado")}
- Nicho/Especialidade: ${perfil.nicho || "deduzir do vídeo"}
- Público-alvo: ${perfil.publico || "deduzir do vídeo"}
- Tom de voz: ${perfil.tom || "deduzir do vídeo"}
- Objetivo do perfil: ${perfil.objetivo || "não informado"}

# VÍDEO CAMPEÃO ORIGINAL
- Resultado público: ${metricas || "não disponível"}
- Direção do estrategista: ${perfil.direcao || "nenhuma"}
- Legenda original: ${String(fonte.legenda || "").slice(0, 1500) || "não disponível"}
- Gancho visual (0-3s): ${video.gancho_visual || "não identificado"}
- Textos na tela: ${video.textos_na_tela || "nenhum"}
- Ritmo de edição: ${video.ritmo_edicao || "não identificado"}
- Transcrição da fala:
"""
${String(video.transcricao || "(vídeo sem fala)").slice(0, 20000)}
"""

Gere agora o JSON completo com o Raio-X, as 3 variações de Reels e o carrossel de 6 slides.`;
}
