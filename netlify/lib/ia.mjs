import { ErroAmigavel } from "./fontes.mjs";
import { CRITERIOS, PROIBIDO, EXEMPLOS } from "./metodo.mjs";

// Modelos. O "olho" usa o modelo mais perceptivo; se não estiver disponível, cai para os rápidos.
const MODELO_ANALISE = () => process.env.GEMINI_MODEL_ANALISE || "gemini-4-argon";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_RESERVA = () => process.env.GEMINI_MODEL_RESERVA || "gemini-3.6-flash";
const CLAUDE_MODEL = () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const FPS = () => Number(process.env.GEMINI_FPS || 4); // quadros por segundo que a IA enxerga (padrão do Google: 1)
const esperar = ms => new Promise(r => setTimeout(r, ms));

// Extrai o primeiro objeto JSON de uma resposta (tolera cercas ```json).
export function lerJSON(texto) {
  const t = String(texto || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i >= 0 && f > i) { try { return JSON.parse(t.slice(i, f + 1)); } catch {} }
  throw new ErroAmigavel("A IA devolveu uma resposta incompleta. Tente de novo.");
}

// Chama o Gemini tentando uma lista de modelos; 503/500/429/404 passam para o próximo.
async function gemini(partes, { modelos, ...opcoes } = {}) {
  const lista = modelos || [GEMINI_MODEL(), GEMINI_MODEL(), GEMINI_RESERVA(), GEMINI_RESERVA()];
  const pausas = [0, 4000, 2000, 8000, 3000, 8000];
  for (let i = 0; i < lista.length; i++) {
    if (pausas[i]) await esperar(pausas[i]);
    try { return await geminiUmaVez(lista[i], partes, opcoes); }
    catch (e) {
      if (e.semMetadados) { // o modelo não aceitou o ajuste de quadros por segundo: tenta sem
        try { return await geminiUmaVez(lista[i], partes.map(semFps), opcoes); } catch (e2) { if (!e2.temporario) throw e2; continue; }
      }
      if (!e.temporario) throw e;
    }
  }
  throw new ErroAmigavel("O Gemini (Google) está sobrecarregado agora. Espere um ou dois minutos e tente de novo.");
}
const semFps = p => { if (!p.video_metadata) return p; const { video_metadata, ...resto } = p; return resto; };

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
    if (r.status === 400 && /video_metadata|videoMetadata|fps/i.test(m)) { const e = new Error("metadados"); e.semMetadados = true; throw e; }
    if ([429, 500, 502, 503, 504].includes(r.status)) { const e = new Error("temporario"); e.temporario = true; throw e; }
    if (r.status === 404) { const e = new Error("modelo"); e.temporario = true; throw e; }
    if (r.status === 403 && !/api key/i.test(m)) { const e = new Error("sem acesso ao modelo"); e.temporario = true; throw e; }
    if ((r.status === 400 || r.status === 403) && /api key|permission/i.test(m)) throw new ErroAmigavel("A chave do Gemini foi recusada. Confira GEMINI_API_KEY na Netlify.");
    if (/private|unlisted|not.*public|unavailable video/i.test(m)) throw new ErroAmigavel("Esse vídeo do YouTube não é público. Só dá para ler vídeos públicos.");
    throw new ErroAmigavel("O Gemini não conseguiu processar o vídeo (" + r.status + ").");
  }
  const texto = (corpo.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!texto) throw new ErroAmigavel("O Gemini não devolveu nada para esse vídeo.");
  return texto;
}

const exemplos = () => EXEMPLOS.map((e, i) => `Exemplo ${i + 1}. Vídeo: ${e.video}\nANÁLISE RUIM (genérica, não faça assim): ${e.ruim}\nANÁLISE BOA (concreta, faça assim): ${e.bom}`).join("\n\n");

// 1) O "olho": assiste ao vídeo e faz o Raio-X completo com o método Space Media.
export async function analisarVideo({ youtubeUrl, video, texto, correcao, legenda }) {
  const instrucao = `Você é o analista sênior de vídeos virais da Space Media, uma produtora de conteúdo. Seu olhar é treinado
para enxergar o que realmente fez um vídeo bombar, e não para repetir teoria de marketing.
${texto ? "Você NÃO tem o vídeo, só a fala transcrita abaixo. Analise a partir dela e deixe vazios os campos visuais que não dá para saber." : "Assista ao vídeo INTEIRO com atenção, quadro a quadro. Olhe primeiro para as pessoas: o corpo, o que fazem, o que tem de incomum nelas e na cena."}

# CRITÉRIOS DO MÉTODO SPACE MEDIA
${CRITERIOS}

# PROIBIDO (análise genérica)
Nunca use estas expressões sem dizer exatamente a que se referem: ${PROIBIDO}
Toda afirmação precisa apontar algo que acontece no vídeo e, quando possível, em que segundo.

# EXEMPLOS
${exemplos()}
${correcao ? `\n# CORREÇÃO DO ESTRATEGISTA\nO estrategista humano assistiu ao vídeo e corrigiu a análise anterior: "${correcao}"\nTrate isso como verdade e reconstrua a análise inteira a partir disso.\n` : ""}${legenda ? `\n# LEGENDA ORIGINAL DO POST\n${String(legenda).slice(0, 1500)}\n` : ""}${texto ? `\n# FALA DO VÍDEO\n"""\n${String(texto).slice(0, 20000)}\n"""\n` : ""}
# RESPOSTA
Responda SOMENTE com JSON válido, em português do Brasil, neste formato:
{
  "resumo_em_uma_frase": "como você contaria este vídeo a um amigo, em até 20 palavras",
  "descricao_literal": "o que se vê, sem interpretar: quem aparece, como é, o que faz, segundo a segundo nos primeiros 5s e depois em resumo",
  "transcricao": "tudo o que é falado, palavra por palavra, no idioma original (vazio se não houver fala)",
  "tem_fala": true,
  "gancho_visual": "o que aparece e acontece na tela nos 3 primeiros segundos",
  "textos_na_tela": "textos sobrepostos, em ordem, separados por ' | ' (vazio se não houver)",
  "ritmo_edicao": "cortes, B-roll, legendas, música, duração aproximada",
  "raio_x": {
    "elemento_central": "a coisa concreta que faz parar de rolar o feed",
    "pergunta_na_cabeca": "a pergunta que o espectador faz e que o mantém assistindo",
    "tipo_gancho": "nome curto do mecanismo (ex.: Impossível aparente, Contradição, Risco iminente)",
    "por_que_funcionou": "2 a 3 frases concretas, citando o que acontece e quando",
    "o_que_sustenta": "o que mantém a atenção depois do gancho; diga com franqueza se o resto não acrescenta nada",
    "formula_estrutural": "Etapa → Etapa → Etapa",
    "como_replicar": "o mecanismo reaproveitável em outro nicho, sem copiar a cena",
    "nicho_detectado": "tema do vídeo em poucas palavras"
  },
  "autenticidade": {
    "probabilidade_ia": 0,
    "sinais": ["0:02 · sinal observado"],
    "observacao": "1 frase explicando a conclusão; se não houver sinais, diga o que indica que é real"
  }
}
"probabilidade_ia" é um número de 0 a 100: a chance de o vídeo ter sido gerado (no todo ou em parte) por IA.`;

  const partes = [];
  if (youtubeUrl) partes.push({ file_data: { file_uri: youtubeUrl }, video_metadata: { fps: FPS() } });
  else if (video) partes.push({ inline_data: { mime_type: video.tipo, data: video.base64 }, video_metadata: { fps: FPS() } });
  partes.push({ text: instrucao });

  const modelos = [MODELO_ANALISE(), MODELO_ANALISE(), GEMINI_MODEL(), GEMINI_MODEL(), GEMINI_RESERVA(), GEMINI_RESERVA()];
  const r = lerJSON(await gemini(partes, { modelos, temperatura: 0.3 }));
  const rx = r.raio_x || {};
  const au = r.autenticidade || {};
  let prob = Math.round(Number(au.probabilidade_ia));
  if (!Number.isFinite(prob)) prob = null; else prob = Math.max(0, Math.min(100, prob));
  return {
    resumo: String(r.resumo_em_uma_frase || ""),
    descricao: String(r.descricao_literal || ""),
    transcricao: texto ? String(texto) : String(r.transcricao || "").trim(),
    tem_fala: texto ? true : r.tem_fala !== false,
    gancho_visual: String(r.gancho_visual || ""),
    textos_na_tela: String(r.textos_na_tela || ""),
    ritmo_edicao: String(r.ritmo_edicao || ""),
    raio_x: {
      elemento_central: String(rx.elemento_central || ""),
      pergunta_na_cabeca: String(rx.pergunta_na_cabeca || ""),
      tipo_gancho: String(rx.tipo_gancho || ""),
      por_que_funcionou: String(rx.por_que_funcionou || ""),
      o_que_sustenta: String(rx.o_que_sustenta || ""),
      formula_estrutural: String(rx.formula_estrutural || ""),
      como_replicar: String(rx.como_replicar || ""),
      nicho_detectado: String(rx.nicho_detectado || ""),
    },
    autenticidade: texto ? null : {
      probabilidade_ia: prob,
      veredito: prob == null ? "Não avaliado" : prob >= 66 ? "Provavelmente gerado por IA" : prob >= 35 ? "Incerto" : "Provavelmente real",
      sinais: (Array.isArray(au.sinais) ? au.sinais : []).map(String).slice(0, 6),
      observacao: String(au.observacao || ""),
    },
  };
}

// 2) Escrever os roteiros a partir do Raio-X. Usa Claude se houver chave; senão, Gemini.
export async function escreverRoteiros(prompt) {
  if (process.env.ANTHROPIC_API_KEY) {
    let ultimo;
    for (const pausa of [0, 5000]) {
      if (pausa) await esperar(pausa);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) {
        const texto = (corpo.content || []).filter(b => b.type === "text").map(b => b.text).join("");
        return { dados: lerJSON(texto), motor: "claude" };
      }
      if (r.status === 401) throw new ErroAmigavel("A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY na Netlify.");
      if (r.status === 400 && /credit/i.test(JSON.stringify(corpo))) throw new ErroAmigavel("Os créditos da API da Anthropic acabaram.");
      ultimo = r.status;
      if (![429, 500, 529].includes(r.status)) break;
    }
    console.error("Claude falhou", ultimo, "- usando Gemini para escrever");
  }
  return { dados: lerJSON(await gemini([{ text: prompt }], { temperatura: 0.9 })), motor: "gemini" };
}

const fmt = n => (n == null ? null : Number(n).toLocaleString("pt-BR"));

export function montarPrompt({ perfil = {}, analise, fonte = {} }) {
  const m = fonte.metricas || {};
  const metricas = [
    m.visualizacoes && fmt(m.visualizacoes) + " visualizações",
    m.curtidas && fmt(m.curtidas) + " curtidas",
    m.comentarios && fmt(m.comentarios) + " comentários",
    m.compartilhamentos && fmt(m.compartilhamentos) + " compartilhamentos",
  ].filter(Boolean).join(", ");
  const temPerfil = perfil && (perfil.nicho || perfil.publico || perfil.tom);
  const rx = analise.raio_x;
  const ehIA = analise.autenticidade && analise.autenticidade.probabilidade_ia >= 66;

  return `# PAPEL E OBJETIVO
Você é Diretor Criativo e Copywriter de Retenção da Space Media, escrevendo em português do Brasil.
O vídeo campeão abaixo já foi analisado pelo nosso analista. Sua tarefa é multiplicar o MECANISMO que fez o vídeo funcionar em 3 novos Reels e 1 carrossel, inéditos e gravados por uma pessoa real com celular.

# RAIO-X JÁ FEITO (use como base, não contradiga)
- Em uma frase: ${analise.resumo}
- Elemento central: ${rx.elemento_central}
- Pergunta na cabeça do espectador: ${rx.pergunta_na_cabeca}
- Tipo de gancho: ${rx.tipo_gancho}
- Por que funcionou: ${rx.por_que_funcionou}
- O que sustenta depois do gancho: ${rx.o_que_sustenta}
- Fórmula: ${rx.formula_estrutural}
- Mecanismo replicável: ${rx.como_replicar}
${ehIA ? "- ATENÇÃO: o vídeo original provavelmente foi gerado por IA. Não proponha cenas impossíveis de gravar. Replique o mecanismo (a contradição, a pergunta) com situações reais.\n" : ""}
# REGRAS DE ESCRITA
1. O GANCHO de cada Reel reproduz o MECANISMO do Raio-X (o tipo de "como assim?"), adaptado ao nicho do perfil. Máximo 12 palavras. Começa direto na ação, sem introdução.
2. PROIBIDO clichês de IA: "No mundo acelerado de hoje", "Descubra o segredo", "Mergulhe", "Desvende", "É crucial", "Olá pessoal, tudo bem?", "Você sabia que...".
3. Escreva para ser FALADO: frases curtas, palavras do dia a dia, ritmo de conversa.
4. Respeite o tom de voz do perfil. Não invente dados, preços, nomes de pessoas ou resultados numéricos.
5. Não copie a cena nem as frases do original: reaproveite o mecanismo e a estrutura.
6. Cenas simples de gravar com celular. Texto na tela: no máximo 7 palavras.
${temPerfil ? "" : "7. O perfil do criador não foi informado: escreva para o mesmo tema e público do vídeo original.\n"}
# 3 VARIAÇÕES DE REELS
- Variação 1, ângulo "Erro Oculto / Alerta": o que o público faz achando que está certo, mas piora o problema.
- Variação 2, ângulo "Mito vs. Realidade": quebra uma crença comum do nicho na primeira frase.
- Variação 3, ângulo "Prático / Bastidor / Caso Real": mostra a solução em ação.
Cada Reel tem exatamente 4 blocos: GANCHO (0-3s), DESENVOLVIMENTO / RETENÇÃO, VIRADA / SOLUÇÃO, CTA (CHAMADA PARA AÇÃO).

# CARROSSEL (exatamente 6 slides)
1: headline magnética + subtítulo. 2: contexto do problema. 3: erro comum ou causa raiz. 4: a virada / método em passos. 5: resumo salvável (checklist ou "Faça isso / Evite aquilo"). 6: conclusão + CTA.

# FORMATO DE SAÍDA
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código:
{
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
- Nicho/Especialidade: ${perfil.nicho || rx.nicho_detectado || "o mesmo do vídeo"}
- Público-alvo: ${perfil.publico || "o mesmo do vídeo"}
- Tom de voz: ${perfil.tom || "o mesmo do vídeo"}
- Objetivo do perfil: ${perfil.objetivo || "não informado"}
- Direção do estrategista: ${perfil.direcao || "nenhuma"}

# VÍDEO ORIGINAL
- Resultado público: ${metricas || "não disponível"}
- O que se vê: ${analise.descricao || "não disponível"}
- Textos na tela: ${analise.textos_na_tela || "nenhum"}
- Ritmo de edição: ${analise.ritmo_edicao || "não identificado"}
- Fala:
"""
${String(analise.transcricao || "(vídeo sem fala)").slice(0, 20000)}
"""

Gere agora o JSON com as 3 variações de Reels e o carrossel de 6 slides.`;
}
