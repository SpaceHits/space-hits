// ============================================================
// MÉTODO SPACE MEDIA: o "olhar" que a IA usa para analisar vídeos.
// Este é o arquivo para editar quando quiser ensinar algo novo à ferramenta.
// Escreva em português normal. Novos exemplos vão em EXEMPLOS, no fim.
// ============================================================

export const CRITERIOS = `
1. ELEMENTO CENTRAL. Antes de qualquer teoria, diga QUAL é a coisa concreta que faz a pessoa parar de rolar o feed.
   Quase sempre é algo que provoca "como assim?": um impossível aparente, uma contradição (idade × feito, corpo × ação,
   lugar × atividade), um extremo, uma raridade, um risco, uma transformação, um resultado inesperado.
   Nomeie o elemento com palavras simples e concretas, como você contaria a um amigo.
2. PERGUNTA NA CABEÇA. Qual pergunta o espectador faz nos primeiros segundos e que só se responde assistindo?
   ("Como ela faz isso sem os braços?", "Isso é real?", "O que vai acontecer?"). Essa pergunta é o motor da retenção.
3. GANCHO × RECHEIO. Separe o que prende (o gancho) do que só preenche o tempo. Se o resto do vídeo não acrescenta
   nada novo e vive só do impacto inicial, diga isso com franqueza.
4. PROVA VISUAL. O que a imagem mostra que a fala não precisaria dizer? Muitos vídeos campeões funcionam sem fala.
5. AUTENTICIDADE. Avalie se o vídeo é real, editado ou gerado por IA. Um elemento "impossível" pode ser talento raro,
   truque de edição ou geração por IA. Procure sinais: anatomia que muda ou não fecha, física estranha (peso, gravidade,
   contato com o chão, roupas e cabelo), mãos e rostos que se deformam, objetos que surgem ou somem, fundo que muda,
   textos ilegíveis, movimento fluido demais, câmera perfeita demais, ausência de cortes naturais, marcas d'água de
   ferramentas de IA, som genérico. Dê uma probabilidade honesta e cite os sinais com o segundo em que aparecem.
6. O QUE DÁ PARA REPLICAR. Qual é o mecanismo reaproveitável (não a cena)? Ex.: "mostrar alguém fazendo o que
   parece impossível para a condição dela" é um mecanismo; "ginasta sem braços" é só a cena.
`;

// Palavras vagas que denunciam análise genérica.
export const PROIBIDO = `"conteúdo envolvente", "visual impactante", "gera curiosidade" (sem dizer qual curiosidade),
"prende a atenção do público" (sem dizer o quê), "storytelling", "autenticidade" como elogio vazio, "conexão emocional"
(sem dizer qual emoção e por quê), "gatilho mental" (sem nomear qual).`;

// Exemplos de análise RUIM × BOA. Adicione os seus aqui (quanto mais, melhor o olhar da ferramenta).
export const EXEMPLOS = [
  {
    video: "Senhor de cabelo branco faz um mortal para trás numa praça e cai em pé, depois sorri para a câmera.",
    ruim: "O gancho usa um visual impactante e gera curiosidade, prendendo a atenção do público com uma cena envolvente.",
    bom: "Elemento central: um homem de uns 80 anos dando um mortal. A contradição idade × acrobacia faz a pessoa pensar 'isso é real?' no primeiro segundo, e ela assiste até a aterrissagem para confirmar. O sorriso final entrega a recompensa. Depois disso não há mais nada: o vídeo vive só do gancho. Mecanismo replicável: mostrar alguém fazendo o que ninguém espera da condição dele.",
  },
];
