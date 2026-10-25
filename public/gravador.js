// Gravador com teleprompter do Space Hits.
// Abre a câmera frontal em tela cheia, rola o roteiro perto da lente e grava vídeo com som.
// Depois da gravação: assistir, regravar, salvar no aparelho ou compartilhar.
(function () {
  "use strict";
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("rc_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("rc_" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const TIPOS = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const tipoGravacao = () => (window.MediaRecorder && MediaRecorder.isTypeSupported) ? (TIPOS.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "") : "";

  const el = document.createElement("div");
  el.className = "grav";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Gravar com teleprompter");
  el.innerHTML = `
    <video class="gv-cam" id="gv-cam" playsinline muted autoplay></video>
    <div class="gv-texto" id="gv-texto-box"><div class="gv-rolo" id="gv-rolo"></div></div>
    <div class="gv-topo">
      <button type="button" class="gv-icone" id="gv-fechar" aria-label="Fechar">✕</button>
      <span class="gv-tempo" id="gv-tempo" hidden><i></i><b id="gv-relogio">00:00</b></span>
      <button type="button" class="gv-icone" id="gv-virar" aria-label="Trocar câmera">⟲</button>
    </div>
    <div class="gv-conta" id="gv-conta" hidden></div>
    <div class="gv-aviso" id="gv-aviso" hidden></div>
    <div class="gv-base" id="gv-base">
      <div class="gv-ajustes" id="gv-ajustes">
        <label for="gv-vel">Velocidade <input type="range" id="gv-vel" min="10" max="110"></label>
        <label for="gv-tam">Letra <input type="range" id="gv-tam" min="22" max="56"></label>
      </div>
      <div class="gv-botoes">
        <span class="gv-dica" id="gv-dica">Toque no texto para testar a rolagem</span>
        <button type="button" class="gv-rec" id="gv-rec" aria-label="Começar a gravar"><span></span></button>
        <span class="gv-dica gv-dica-dir" id="gv-formato"></span>
      </div>
    </div>
    <div class="gv-revisao" id="gv-revisao" hidden>
      <video id="gv-rev" playsinline controls></video>
      <div class="gv-acoes">
        <button type="button" class="gv-btn" id="gv-regravar">Regravar</button>
        <button type="button" class="gv-btn" id="gv-salvar">Salvar no aparelho</button>
        <button type="button" class="gv-btn gv-ouro" id="gv-compartilhar">Compartilhar</button>
      </div>
      <p class="gv-nota" id="gv-nota"></p>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);

  const st = { stream: null, rec: null, partes: [], frente: true, gravando: false, rolando: false, raf: 0, last: 0, acc: 0, inicio: 0, relogio: 0, blob: null, url: null, nome: "roteiro", tipo: "", lock: null, contagem: 0 };
  $("#gv-vel").value = LS.get("gv_vel", 38);
  $("#gv-tam").value = LS.get("gv_tam", 32);
  const aplicarTam = () => { $("#gv-rolo").style.fontSize = $("#gv-tam").value + "px"; };
  $("#gv-tam").oninput = () => { aplicarTam(); LS.set("gv_tam", +$("#gv-tam").value); };
  $("#gv-vel").oninput = () => LS.set("gv_vel", +$("#gv-vel").value);

  function aviso(txt) { const a = $("#gv-aviso"); a.hidden = !txt; a.innerHTML = txt || ""; }
  function pararCamera() { if (st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; } $("#gv-cam").srcObject = null; }

  async function ligarCamera() {
    pararCamera(); aviso("");
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      aviso("Este navegador não libera a câmera para sites.<br>Se você abriu pelo Instagram ou pelo WhatsApp, toque em <b>⋯</b> e escolha <b>Abrir no navegador</b> (Safari ou Chrome).");
      return false;
    }
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: st.frente ? "user" : "environment", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const v = $("#gv-cam"); v.srcObject = st.stream; v.classList.toggle("espelho", st.frente);
      try { await v.play(); } catch (e) {}
      return true;
    } catch (e) {
      const n = e && e.name;
      if (n === "NotAllowedError" || n === "SecurityError") aviso("Você não liberou a câmera e o microfone.<br>Para liberar: toque no <b>ícone de cadeado</b> (ou <b>aA</b>) na barra de endereço e permita <b>Câmera</b> e <b>Microfone</b>. Depois feche e abra o gravador de novo.");
      else if (n === "NotFoundError" || n === "OverconstrainedError") aviso("Não encontrei câmera ou microfone neste aparelho.");
      else if (n === "NotReadableError") aviso("A câmera está em uso por outro aplicativo. Feche-o e tente de novo.");
      else aviso("Não consegui abrir a câmera (" + (n || "erro") + ").");
      return false;
    }
  }

  // Rolagem do texto
  function passo(ts) {
    if (!st.rolando) return;
    const dt = st.last ? (ts - st.last) / 1000 : 0; st.last = ts;
    const box = $("#gv-texto-box"); st.acc += dt * (+$("#gv-vel").value);
    const px = Math.floor(st.acc); if (px > 0) { box.scrollTop += px; st.acc -= px; }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) { st.rolando = false; return; }
    st.raf = requestAnimationFrame(passo);
  }
  function rolar(on) { st.rolando = on; cancelAnimationFrame(st.raf); if (on) { st.last = 0; st.acc = 0; st.raf = requestAnimationFrame(passo); } }
  $("#gv-texto-box").addEventListener("click", () => { if (!st.gravando) rolar(!st.rolando); });

  // Relógio
  const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function tic() { if (!st.gravando) return; $("#gv-relogio").textContent = fmt((Date.now() - st.inicio) / 1000); st.relogio = setTimeout(tic, 250); }

  async function contagem() {
    const c = $("#gv-conta"); c.hidden = false;
    for (const n of [3, 2, 1]) { c.textContent = n; c.classList.remove("pulso"); void c.offsetWidth; c.classList.add("pulso"); await new Promise(r => (st.contagem = setTimeout(r, 900))); if (el.hidden) { c.hidden = true; return false; } }
    c.hidden = true; return true;
  }

  async function iniciar() {
    if (!st.stream) { const ok = await ligarCamera(); if (!ok) return; }
    if (!window.MediaRecorder) { aviso("Este navegador não grava vídeo. Atualize o Safari ou o Chrome e tente de novo."); return; }
    rolar(false); $("#gv-texto-box").scrollTop = 0;
    $("#gv-rec").disabled = true; $("#gv-ajustes").classList.add("apagado");
    if (!(await contagem())) { $("#gv-rec").disabled = false; $("#gv-ajustes").classList.remove("apagado"); return; }
    st.tipo = tipoGravacao(); st.partes = [];
    try { st.rec = new MediaRecorder(st.stream, st.tipo ? { mimeType: st.tipo, videoBitsPerSecond: 6000000 } : undefined); }
    catch (e) { try { st.rec = new MediaRecorder(st.stream); st.tipo = st.rec.mimeType || ""; } catch (e2) { aviso("Não consegui iniciar a gravação neste navegador."); $("#gv-rec").disabled = false; return; } }
    st.rec.ondataavailable = ev => { if (ev.data && ev.data.size) st.partes.push(ev.data); };
    st.rec.onstop = terminar;
    st.rec.start(1000);
    st.gravando = true; st.inicio = Date.now(); tic();
    el.classList.add("gravando"); $("#gv-tempo").hidden = false; $("#gv-rec").disabled = false; $("#gv-rec").setAttribute("aria-label", "Parar gravação");
    $("#gv-virar").disabled = true;
    rolar(true);
  }
  function parar() { if (st.rec && st.rec.state !== "inactive") st.rec.stop(); st.gravando = false; clearTimeout(st.relogio); rolar(false); }

  function terminar() {
    el.classList.remove("gravando"); $("#gv-tempo").hidden = true; $("#gv-virar").disabled = false; $("#gv-ajustes").classList.remove("apagado");
    $("#gv-rec").setAttribute("aria-label", "Começar a gravar");
    const tipo = (st.rec && st.rec.mimeType) || st.tipo || "video/webm";
    st.blob = new Blob(st.partes, { type: tipo.split(";")[0] });
    if (st.url) URL.revokeObjectURL(st.url);
    st.url = URL.createObjectURL(st.blob);
    const r = $("#gv-rev"); r.src = st.url;
    $("#gv-revisao").hidden = false;
    pararCamera();
    const ehMp4 = /mp4/.test(tipo);
    $("#gv-nota").textContent = ehMp4 ? "Vídeo em MP4, pronto para o Instagram, TikTok e WhatsApp." : "Este navegador gravou em WebM. O WhatsApp aceita; para o Instagram, prefira gravar pelo Safari (iPhone) ou por um Chrome atualizado.";
    $("#gv-compartilhar").hidden = !(navigator.canShare && navigator.canShare({ files: [arquivo()] }));
  }
  function arquivo() {
    const ext = st.blob && /mp4/.test(st.blob.type) ? "mp4" : "webm";
    const nome = `space-hits-${st.nome}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
    return new File([st.blob || new Blob()], nome, { type: (st.blob && st.blob.type) || "video/mp4" });
  }

  $("#gv-rec").onclick = () => { if (st.gravando) parar(); else iniciar(); };
  $("#gv-virar").onclick = async () => { if (st.gravando) return; st.frente = !st.frente; await ligarCamera(); };
  $("#gv-regravar").onclick = async () => { $("#gv-revisao").hidden = true; $("#gv-rev").removeAttribute("src"); $("#gv-texto-box").scrollTop = 0; await ligarCamera(); };
  $("#gv-salvar").onclick = () => {
    const f = arquivo(); const a = document.createElement("a"); a.href = st.url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    $("#gv-nota").textContent = "Pronto! No iPhone, o vídeo aparece em Arquivos > Transferências; abra e toque em compartilhar > Salvar vídeo para mandar para a galeria.";
  };
  $("#gv-compartilhar").onclick = async () => {
    try { await navigator.share({ files: [arquivo()], title: "Vídeo gravado no Space Hits" }); }
    catch (e) { if (e && e.name !== "AbortError") $("#gv-nota").textContent = "Não consegui abrir o compartilhamento. Use Salvar no aparelho."; }
  };

  function fechar() {
    if (st.gravando) { st.partes = []; if (st.rec) { st.rec.onstop = null; try { st.rec.stop(); } catch (e) {} } st.gravando = false; }
    clearTimeout(st.contagem); clearTimeout(st.relogio); rolar(false);
    pararCamera(); el.hidden = true; el.classList.remove("gravando"); $("#gv-revisao").hidden = true; $("#gv-conta").hidden = true;
    $("#gv-rec").disabled = false; $("#gv-ajustes").classList.remove("apagado"); $("#gv-tempo").hidden = true; $("#gv-virar").disabled = false;
    document.body.style.overflow = "";
    try { st.lock && st.lock.release(); } catch (e) {} st.lock = null;
  }
  $("#gv-fechar").onclick = fechar;
  document.addEventListener("keydown", e => { if (el.hidden) return; if (e.key === "Escape") fechar(); });

  window.Gravador = {
    suportado: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    async abrir(texto, nome) {
      st.nome = String(nome || "roteiro").toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "roteiro";
      $("#gv-rolo").textContent = texto; aplicarTam();
      $("#gv-texto-box").scrollTop = 0; $("#gv-revisao").hidden = true;
      $("#gv-formato").textContent = /mp4/.test(tipoGravacao()) ? "MP4" : "";
      el.hidden = false; document.body.style.overflow = "hidden";
      try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => (st.lock = l)).catch(() => {}); } catch (e) {}
      await ligarCamera();
    },
    fechar,
  };
})();
