// Descobre de qual rede é o link colado e se é um vídeo ou um perfil.
export function detectarLink(bruto) {
  let texto = String(bruto || "").trim();
  if (!texto) return { erro: "Cole o link do vídeo." };

  // @perfil solto (fase 2)
  if (/^@[\w.]{2,30}$/.test(texto)) {
    return { plataforma: "instagram", tipo: "perfil", usuario: texto.slice(1) };
  }

  if (!/^https?:\/\//i.test(texto)) texto = "https://" + texto;
  let u;
  try { u = new URL(texto); } catch { return { erro: "Isso não parece um link. Copie o link do vídeo e cole aqui." }; }
  const host = u.hostname.replace(/^(www\.|m\.|vm\.|vt\.)/, "");
  const partes = u.pathname.split("/").filter(Boolean);

  // YouTube
  if (host === "youtu.be" && partes[0]) {
    return { plataforma: "youtube", tipo: "video", url: "https://www.youtube.com/watch?v=" + partes[0] };
  }
  if (host.endsWith("youtube.com")) {
    if (partes[0] === "shorts" && partes[1]) return { plataforma: "youtube", tipo: "video", url: "https://www.youtube.com/watch?v=" + partes[1] };
    const v = u.searchParams.get("v");
    if (v) return { plataforma: "youtube", tipo: "video", url: "https://www.youtube.com/watch?v=" + v };
    if (partes[0] && (partes[0].startsWith("@") || ["c", "channel", "user"].includes(partes[0]))) return { plataforma: "youtube", tipo: "perfil", url: u.origin + u.pathname };
    return { erro: "Não reconheci esse link do YouTube. Use o link de um vídeo ou Short." };
  }

  // Instagram
  if (host.endsWith("instagram.com")) {
    const i = partes.findIndex(p => ["reel", "reels", "p", "tv"].includes(p));
    if (i >= 0 && partes[i + 1]) {
      const tipo = partes[i] === "reels" ? "reel" : partes[i];
      return { plataforma: "instagram", tipo: "video", url: `https://www.instagram.com/${tipo}/${partes[i + 1]}/` };
    }
    if (partes[0] && !["explore", "stories", "accounts", "direct"].includes(partes[0])) {
      return { plataforma: "instagram", tipo: "perfil", usuario: partes[0], url: `https://www.instagram.com/${partes[0]}/` };
    }
    return { erro: "Não reconheci esse link do Instagram. Abra o Reel, toque em compartilhar e copie o link." };
  }

  // TikTok
  if (host.endsWith("tiktok.com")) {
    if (partes.includes("video") || partes.includes("photo") || /^(vm|vt)\./.test(u.hostname) || partes[0] === "t") {
      return { plataforma: "tiktok", tipo: "video", url: u.origin + u.pathname };
    }
    if (partes[0] && partes[0].startsWith("@")) return { plataforma: "tiktok", tipo: "perfil", usuario: partes[0].slice(1), url: u.origin + u.pathname };
    return { erro: "Não reconheci esse link do TikTok. Use o link de um vídeo." };
  }

  return { erro: "Por enquanto a ferramenta lê links do Instagram, TikTok e YouTube." };
}
