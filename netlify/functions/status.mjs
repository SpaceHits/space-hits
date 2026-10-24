// GET /api/status?id=...  ->  etapa atual e, quando pronto, o resultado.
import { lerTarefa, json } from "../lib/tarefas.mjs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ erro: "Tarefa inválida." }, 400);
  const t = await lerTarefa(id);
  if (!t) return json({ erro: "Tarefa não encontrada." }, 404);
  const { texto, ...publico } = t; // não devolve o texto enviado
  return json(publico);
};

export const config = { path: "/api/status" };
