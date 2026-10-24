// GET /api/quadro?id=...&n=0  ->  imagem JPEG de um momento do gancho.
import { lerQuadro } from "../lib/tarefas.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  const n = Number(u.searchParams.get("n"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n) || n < 0 || n > 9) return new Response("Pedido inválido", { status: 400 });
  const img = await lerQuadro(id, n);
  if (!img) return new Response("Não encontrado", { status: 404 });
  return new Response(img, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
};

export const config = { path: "/api/quadro" };
