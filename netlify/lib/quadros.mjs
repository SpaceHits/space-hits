// Extrai quadros (prints) dos 3 primeiros segundos do vídeo com ffmpeg e guarda no Netlify Blobs.
import { spawn } from "node:child_process";
import { writeFile, rm, copyFile, chmod, access } from "node:fs/promises";
import { constants } from "node:fs";
import ffmpegOriginal from "ffmpeg-static";
import { getStore } from "@netlify/blobs";

export const MOMENTOS = [0.3, 1.5, 2.8]; // segundos: abertura, meio e fim do gancho

const loja = () => getStore({ name: "quadros" });

// Na Netlify o binário pode vir sem permissão de execução: copia para /tmp se precisar.
async function caminhoFfmpeg() {
  try { await access(ffmpegOriginal, constants.X_OK); return ffmpegOriginal; } catch {}
  const tmp = "/tmp/ffmpeg";
  try { await access(tmp, constants.X_OK); return tmp; } catch {}
  await copyFile(ffmpegOriginal, tmp);
  await chmod(tmp, 0o755);
  return tmp;
}

function capturar(ffmpeg, arquivo, segundo) {
  return new Promise(resolve => {
    const p = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "5", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]);
    const partes = [];
    const limite = setTimeout(() => p.kill("SIGKILL"), 20000);
    p.stdout.on("data", d => partes.push(d));
    p.on("error", () => { clearTimeout(limite); resolve(null); });
    p.on("close", () => { clearTimeout(limite); const b = Buffer.concat(partes); resolve(b.length > 500 ? b : null); });
  });
}

// Nunca derruba a tarefa: se algo falhar, devolve lista vazia e o resultado sai sem prints.
export async function extrairQuadros(id, buffer) {
  const arquivo = `/tmp/${id}.mp4`;
  try {
    const ffmpeg = await caminhoFfmpeg();
    await writeFile(arquivo, buffer);
    const feitos = [];
    for (let n = 0; n < MOMENTOS.length; n++) {
      const img = await capturar(ffmpeg, arquivo, MOMENTOS[n]);
      if (!img) continue;
      await loja().set(`${id}/${n}`, img);
      feitos.push({ n, t: MOMENTOS[n] });
    }
    return feitos;
  } catch (e) {
    console.error("Falha ao extrair quadros", id, e);
    return [];
  } finally {
    rm(arquivo, { force: true }).catch(() => {});
  }
}
