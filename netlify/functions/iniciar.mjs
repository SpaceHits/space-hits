// POST /api/iniciar  { link?, texto?, perfil? }  ->  { id }
// Valida o pedido, cria a tarefa e dispara o processamento em segundo plano.
import { detectarLink } from "../lib/links.mjs";
import { salvarTarefa, json, acessoLiberado } from "../lib/tarefas.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  if (!acessoLiberado(req)) return json({ erro: "Código de acesso inválido.", codigo: "acesso" }, 401);

  let corpo;
  try { corpo = await req.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }

  const perfil = limparPerfil(corpo.perfil);
  const texto = String(corpo.texto || "").trim();
  let link = null;

  if (texto) {
    if (texto.split(/\s+/).length < 20) return json({ erro: "Cole a fala completa do vídeo (pelo menos 20 palavras)." }, 400);
    if (texto.length > 20000) return json({ erro: "O texto está longo demais. Use só a fala do vídeo." }, 400);
  } else {
    link = detectarLink(corpo.link);
    if (link.erro) return json({ erro: link.erro }, 400);
    if (link.tipo === "perfil") return json({ erro: "A análise de perfil chega na próxima etapa. Por enquanto, cole o link de um vídeo.", codigo: "perfil" }, 400);
  }

  const id = crypto.randomUUID();
  await salvarTarefa(id, { id, etapa: "fila", criado: Date.now(), link, texto: texto || null, perfil });

  // Dispara a função de segundo plano (responde 202 na hora).
  // Se a chamada interna falhar (ex.: site com proteção de acesso), a página dispara pelo navegador.
  let disparado = false;
  try {
    const alvo = new URL("/.netlify/functions/processar-background", req.url);
    const r = await fetch(alvo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), redirect: "manual" });
    disparado = r.status === 202;
  } catch {}
  return json({ id, disparado });
};

function limparPerfil(p) {
  if (!p || typeof p !== "object") return {};
  const out = {};
  for (const k of ["nome", "nicho", "publico", "tom", "objetivo", "direcao"]) {
    if (p[k]) out[k] = String(p[k]).slice(0, 300);
  }
  return out;
}

export const config = { path: "/api/iniciar" };
