// Função de segundo plano (até 15 minutos): baixa, assiste, escreve.
// Etapas gravadas na tarefa: fila → buscando → assistindo → escrevendo → pronto | erro
import { lerTarefa, salvarTarefa } from "../lib/tarefas.mjs";
import { buscarVideo, baixarVideo, ErroAmigavel } from "../lib/fontes.mjs";
import { assistirVideo, escreverRoteiros, montarPrompt } from "../lib/ia.mjs";
import { extrairQuadros } from "../lib/quadros.mjs";

export default async (req) => {
  let id;
  try { ({ id } = await req.json()); } catch { return; }
  const t = await lerTarefa(id);
  if (!t || t.etapa !== "fila") return; // evita reprocessar em novas tentativas

  try {
    let video, fonte = {}, quadros = [], capa = null;

    if (t.texto) {
      video = { transcricao: t.texto, gancho_visual: "", textos_na_tela: "", ritmo_edicao: "", tem_fala: true };
    } else if (t.link.plataforma === "youtube") {
      await salvarTarefa(id, { etapa: "assistindo" });
      const vid = new URL(t.link.url).searchParams.get("v");
      if (vid) capa = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      video = await assistirVideo({ youtubeUrl: t.link.url });
    } else {
      await salvarTarefa(id, { etapa: "buscando" });
      fonte = await buscarVideo(t.link, process.env.APIFY_TOKEN);
      await salvarTarefa(id, { etapa: "assistindo", fonte: { autor: fonte.autor, metricas: fonte.metricas } });
      const arquivo = await baixarVideo(fonte.arquivo);
      // Assiste com o Gemini e tira os prints do gancho ao mesmo tempo.
      [video, quadros] = await Promise.all([assistirVideo({ video: arquivo }), extrairQuadros(id, arquivo.buffer)]);
    }

    if (!video.tem_fala && !video.ritmo_edicao) throw new ErroAmigavel("Não consegui entender esse vídeo. Tente outro link.");

    const analise = { gancho_visual: video.gancho_visual, textos_na_tela: video.textos_na_tela, ritmo_edicao: video.ritmo_edicao };
    await salvarTarefa(id, { etapa: "escrevendo", transcricao: video.transcricao, analise, quadros, capa });
    const { dados, motor } = await escreverRoteiros(montarPrompt({ perfil: t.perfil, video, fonte }));

    await salvarTarefa(id, { etapa: "pronto", resultado: dados, motor, concluido: Date.now() });
  } catch (e) {
    const amigavel = e instanceof ErroAmigavel;
    if (!amigavel) console.error("Falha na tarefa", id, e);
    await salvarTarefa(id, { etapa: "erro", erro: amigavel ? e.message : "Algo deu errado no processamento. Tente de novo." });
  }
};

export const config = { background: true };
