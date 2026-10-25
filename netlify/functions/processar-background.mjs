// Função de segundo plano (até 15 minutos): busca, analisa, escreve.
// Etapas gravadas na tarefa: fila → buscando → assistindo → escrevendo → pronto | erro
// Na etapa "escrevendo" o Raio-X já fica disponível, para a página mostrar antes dos roteiros.
import { lerTarefa, salvarTarefa } from "../lib/tarefas.mjs";
import { buscarVideo, baixarVideo, ErroAmigavel } from "../lib/fontes.mjs";
import { analisarVideo, escreverRoteiros, montarPrompt } from "../lib/ia.mjs";
import { extrairQuadros } from "../lib/quadros.mjs";

export default async (req) => {
  let id;
  try { ({ id } = await req.json()); } catch { return; }
  const t = await lerTarefa(id);
  if (!t || t.etapa !== "fila") return; // evita reprocessar em novas tentativas
  await salvarTarefa(id, { etapa: t.texto ? "assistindo" : t.link.plataforma === "youtube" ? "assistindo" : "buscando" });

  try {
    let analise, fonte = {}, quadros = [], capa = null;
    const correcao = t.correcao || null;

    if (t.texto) {
      analise = await analisarVideo({ texto: t.texto, correcao });
    } else if (t.link.plataforma === "youtube") {
      const vid = new URL(t.link.url).searchParams.get("v");
      if (vid) capa = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      analise = await analisarVideo({ youtubeUrl: t.link.url, correcao });
    } else {
      fonte = await buscarVideo(t.link, process.env.APIFY_TOKEN);
      await salvarTarefa(id, { etapa: "assistindo", fonte: { autor: fonte.autor, metricas: fonte.metricas } });
      const arquivo = await baixarVideo(fonte.arquivo);
      // Analisa com o Gemini e tira os prints do gancho ao mesmo tempo.
      [analise, quadros] = await Promise.all([
        analisarVideo({ video: arquivo, correcao, legenda: fonte.legenda }),
        extrairQuadros(id, arquivo.buffer),
      ]);
    }

    if (!analise.raio_x.elemento_central && !analise.transcricao) throw new ErroAmigavel("Não consegui entender esse vídeo. Tente outro link.");

    const raioX = { ...analise.raio_x };
    const visual = { resumo: analise.resumo, gancho_visual: analise.gancho_visual, textos_na_tela: analise.textos_na_tela, ritmo_edicao: analise.ritmo_edicao };
    await salvarTarefa(id, { etapa: "escrevendo", transcricao: analise.transcricao, raio_x: raioX, autenticidade: analise.autenticidade, analise: visual, quadros, capa });

    const { dados, motor } = await escreverRoteiros(montarPrompt({ perfil: t.perfil, analise, fonte }));
    const resultado = { raio_x_campeao: raioX, variacoes_reels: dados.variacoes_reels, carrossel: dados.carrossel };
    await salvarTarefa(id, { etapa: "pronto", resultado, motor, concluido: Date.now() });
  } catch (e) {
    const amigavel = e instanceof ErroAmigavel;
    if (!amigavel) console.error("Falha na tarefa", id, e);
    await salvarTarefa(id, { etapa: "erro", erro: amigavel ? e.message : "Algo deu errado no processamento. Tente de novo." });
  }
};

export const config = { background: true };
