// Busca o arquivo de vídeo e as métricas públicas de Instagram e TikTok pelo Apify.
// YouTube não passa por aqui: o Gemini lê o link do YouTube direto.

const APIFY = "https://api.apify.com/v2";

async function rodarAtor(ator, entrada, token) {
  const url = `${APIFY}/acts/${ator}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=240`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entrada) });
  if (r.status === 401 || r.status === 403) throw new ErroAmigavel("A chave do Apify foi recusada. Confira a variável APIFY_TOKEN na Netlify.");
  if (r.status === 402) throw new ErroAmigavel("Os créditos do Apify acabaram neste mês.");
  if (!r.ok) throw new ErroAmigavel("Não consegui ler o vídeo agora (Apify " + r.status + "). Tente de novo em alguns minutos.");
  const itens = await r.json();
  return Array.isArray(itens) ? itens : [];
}

export class ErroAmigavel extends Error {}

const num = (...vs) => { for (const v of vs) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; } return null; };

export async function buscarVideo(link, token) {
  if (!token) throw new ErroAmigavel("Para ler Instagram e TikTok, falta configurar a variável APIFY_TOKEN na Netlify.");

  if (link.plataforma === "instagram") {
    const itens = await rodarAtor("apify~instagram-scraper", { directUrls: [link.url], resultsType: "posts", resultsLimit: 1, addParentData: false }, token);
    const p = itens.find(i => i && (i.videoUrl || i.type === "Video")) || itens[0];
    if (!p || p.error) throw new ErroAmigavel("Não encontrei esse post. Ele precisa ser público e de uma conta aberta.");
    if (!p.videoUrl) throw new ErroAmigavel("Esse post não tem vídeo. Cole o link de um Reel.");
    return {
      arquivo: p.videoUrl,
      autor: p.ownerUsername || "",
      legenda: p.caption || "",
      metricas: {
        visualizacoes: num(p.videoPlayCount, p.videoViewCount, p.playCount),
        curtidas: num(p.likesCount),
        comentarios: num(p.commentsCount),
      },
      duracao: num(p.videoDuration),
    };
  }

  if (link.plataforma === "tiktok") {
    const itens = await rodarAtor("clockworks~tiktok-video-scraper", { postURLs: [link.url], shouldDownloadVideos: true, shouldDownloadCovers: false }, token);
    const p = itens[0];
    if (!p || p.error) throw new ErroAmigavel("Não encontrei esse vídeo do TikTok. Ele precisa ser público.");
    let arquivo = (Array.isArray(p.mediaUrls) && p.mediaUrls[0]) || (p.videoMeta && p.videoMeta.downloadAddr) || null;
    if (!arquivo) throw new ErroAmigavel("Não consegui baixar esse vídeo do TikTok.");
    if (arquivo.startsWith(APIFY) && !arquivo.includes("token=")) arquivo += (arquivo.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
    return {
      arquivo,
      autor: (p.authorMeta && (p.authorMeta.name || p.authorMeta.nickName)) || "",
      legenda: p.text || "",
      metricas: {
        visualizacoes: num(p.playCount),
        curtidas: num(p.diggCount),
        comentarios: num(p.commentCount),
        compartilhamentos: num(p.shareCount),
      },
      duracao: num(p.videoMeta && p.videoMeta.duration),
    };
  }

  throw new ErroAmigavel("Plataforma não suportada.");
}

// Baixa o vídeo para mandar à IA (limite seguro de 19 MB por envio).
export async function baixarVideo(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new ErroAmigavel("O link do arquivo de vídeo expirou. Tente de novo.");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 19 * 1024 * 1024) throw new ErroAmigavel("Esse vídeo é longo demais para esta versão (limite de cerca de 3 minutos).");
  const tipo = (r.headers.get("content-type") || "video/mp4").split(";")[0];
  return { base64: buf.toString("base64"), tipo: tipo.startsWith("video/") ? tipo : "video/mp4" };
}
