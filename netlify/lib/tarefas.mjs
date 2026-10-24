import { getStore } from "@netlify/blobs";

const loja = () => getStore({ name: "tarefas", consistency: "strong" });

export const lerQuadro = (id, n) => getStore({ name: "quadros" }).get(`${id}/${n}`, { type: "arrayBuffer" });

export const lerTarefa = id => loja().get(id, { type: "json" });

export async function salvarTarefa(id, dados) {
  const atual = (await lerTarefa(id)) || {};
  const nova = { ...atual, ...dados, atualizado: Date.now() };
  await loja().setJSON(id, nova);
  return nova;
}

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

// Código de acesso opcional para o beta fechado (variável CODIGO_ACESSO, aceita vários separados por vírgula).
export function acessoLiberado(req) {
  const codigos = String(process.env.CODIGO_ACESSO || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!codigos.length) return true;
  const enviado = String(req.headers.get("x-codigo") || "").trim().toLowerCase();
  return codigos.includes(enviado);
}
