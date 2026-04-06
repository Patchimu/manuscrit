import { useState, useRef, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const _s = document.createElement("style");
_s.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Mono:wght@300;400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  textarea::placeholder { color: #c0b8ae !important; font-family: "Cormorant Garamond", Georgia, serif !important; font-style: italic; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: #d8d2ca; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(_s);

const SW = new Set(["a","o","e","de","do","da","dos","das","em","um","uma","uns","umas","no","na","nos","nas","por","para","com","que","se","não","mas","ou","ao","à","às","aos","seu","sua","seus","suas","ele","ela","eles","elas","eu","tu","nós","me","te","lhe","foi","era","é","são","ser","ter","há","já","isso","este","esta","esse","essa","esses","essas","aquele","quando","como","mais","menos","bem","então","ainda","onde","nem","até","entre","depois","antes","sem","sobre","também","quem","qual","quais","muito","pouco","todo","toda","todos","todas","outro","outra","outros","outras","mesmo","mesma","num","numa","pelo","pela","pelos","pelas"]);

function findMatches(text, terms, phrase = false) {
  const results = [];
  for (const t of terms) {
    const esc = t.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
    const re = new RegExp(phrase ? esc : `\\b${esc}\\b`, "gi");
    let m;
    while ((m = re.exec(text)) !== null)
      results.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
  }
  return results.sort((a, b) => a.start - b.start);
}

const passiveVoice = (text) => { const re = /\b(foi|foram|era|eram|será|serão|seria|seriam|está|estão|esteve|estiveram|sendo|sido|ser)\s+\w+(ado|ada|ados|adas|ido|ida|idos|idas)\b/gi; const r = []; let m; while ((m = re.exec(text)) !== null) r.push({ start: m.index, end: m.index + m[0].length, word: m[0] }); return r; };
const adverbs = (text) => { const re = /\b\w+mente\b/gi; const r = []; let m; while ((m = re.exec(text)) !== null) r.push({ start: m.index, end: m.index + m[0].length, word: m[0] }); return r; };
const wordEchoes = (text) => {
  // O(n) sliding window — handles full novels without freezing
  const re = /\b[a-záàâãéèêíìîóòôõúùûüç]{4,}\b/gi; const pos = []; let m;
  while ((m = re.exec(text)) !== null) { const w = m[0].toLowerCase(); if (!SW.has(w)) pos.push({ word: w, start: m.index, end: m.index + m[0].length }); }
  const seen = new Set(), result = [], lastSeen = new Map();
  for (let i = 0; i < pos.length; i++) {
    const { word, start, end } = pos[i];
    if (lastSeen.has(word)) {
      const prev = lastSeen.get(word);
      if (start - pos[prev].end <= 400) {
        [prev, i].forEach(k => { const key = `${pos[k].start}`; if (!seen.has(key)) { seen.add(key); result.push({...pos[k]}); } });
      }
    }
    lastSeen.set(word, i);
  }
  return result;
};
const sentenceVariation = (text) => (text.match(/[^.!?…\n]+[.!?…]+/g)||[]).map((s,i)=>({i:i+1,len:s.trim().split(/\s+/).filter(Boolean).length,preview:s.trim().slice(0,55)}));
const wordFrequency = (text) => { const f={}; (text.match(/\b[a-záàâãéèêíìîóòôõúùûüç]{3,}\b/gi)||[]).forEach(w=>{const lw=w.toLowerCase();if(!SW.has(lw))f[lw]=(f[lw]||0)+1;}); return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([word,count])=>({word,count})); };
const sentenceStarters = (text) => { const f={}; (text.match(/[^.!?…\n]+[.!?…]+/g)||[]).forEach(s=>{const w=s.trim().match(/^[a-záàâãéèêíìîóòôõúùûüç]+/i);if(w)f[w[0].toLowerCase()]=(f[w[0].toLowerCase()]||0)+1;}); return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([word,count])=>({word,count})); };

const analyzePacing = (text) => {
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.split(/\s+/).length >= 3);
  if (!paras.length) return [];
  return paras.map((para, i) => {
    const sentences = para.match(/[^.!?…]+[.!?…]+/g) || [para];
    const wcs = sentences.map(s => s.trim().split(/\s+/).filter(Boolean).length);
    const avgLen = wcs.reduce((s, n) => s + n, 0) / (wcs.length || 1);
    const words = para.split(/\s+/).filter(Boolean).length;
    // Shorter sentences → faster pace
    const lenScore = Math.max(5, Math.min(95, 100 - (avgLen - 3) * 4.2));
    // Dialogue → faster
    const dChars = (para.match(/["«»""][^"«»""]{1,200}["«»""]/g) || []).reduce((s, m) => s + m.length, 0);
    const dialScore = Math.min(90, (dChars / Math.max(para.length, 1)) * 170);
    // Exclamations/questions → more intensity
    const puncts = (para.match(/[!?…—–]/g) || []).length;
    const punctScore = Math.min(90, puncts * 16);
    const pace = Math.round(lenScore * 0.45 + dialScore * 0.30 + punctScore * 0.25);
    return { i, text: para, words, sentences: sentences.length, avgLen: Math.round(avgLen * 10) / 10, pace: Math.max(5, Math.min(95, pace)), preview: para.slice(0, 100) };
  });
};

// ── AI WRITING DETECTION ──────────────────────────────────────────────
const AI_PATTERNS = [
  // Conectores escolares
  "além disso","no entanto","por outro lado","ademais","portanto","desta forma",
  "nesse sentido","assim sendo","deste modo","por conseguinte","em contrapartida",
  "outrossim","tendo em vista","no que tange","no que se refere","no tocante",
  // Frases de efeito
  "vale ressaltar","é importante destacar","cabe mencionar","é fundamental",
  "é importante notar","é válido destacar","é crucial","é essencial",
  "não podemos ignorar","é imperativo","é imprescindível","é notório",
  // Hedging
  "de certa forma","em certa medida","pode-se dizer","é possível afirmar",
  "em algum grau","de alguma maneira","em certo sentido","de algum modo",
  // Conclusões telegrafadas
  "em suma","em conclusão","diante do exposto","em síntese",
  "em última análise","em linhas gerais","conclui-se que","podemos concluir",
  // Aberturas artificiais
  "é inegável que","não há dúvida de que","ao longo do tempo",
  "no contexto atual","ao longo da história","desde os primórdios",
  "cada vez mais","nos dias atuais","na atualidade","na contemporaneidade",
  // Intensificadores vazios
  "extremamente relevante","de fundamental importância","inegavelmente",
  "indubitavelmente","inquestionavelmente","sem sombra de dúvida",
  "de forma eficaz","de forma eficiente","de maneira abrangente",
  // Redundâncias
  "totalmente único","completamente diferente","absolutamente necessário",
];

const analyzeAiVices = (text) => findMatches(text, AI_PATTERNS, true);

const AI_SCORE_PROMPT = `Você é um especialista em detectar texto gerado por IA em português. Analise o trecho abaixo e retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois.

{
  "score": número de 0 a 100 (0 = claramente humano, 100 = claramente IA),
  "nivel": "Humano" | "Suspeito" | "Provavelmente IA" | "Claramente IA",
  "diagnostico": "2 a 3 frases explicando o veredito de forma direta",
  "padroes_ia": ["lista dos padrões específicos de IA encontrados no texto, máx 6"],
  "trechos_suspeitos": ["até 3 trechos do texto que soam artificiais — copie os trechos exatos, curtos"],
  "pontos_humanos": ["até 4 aspectos que soam autênticos, idiossincráticos ou genuinamente humanos"],
  "como_humanizar": ["3 a 5 sugestões concretas e específicas para deixar o texto mais humano, baseadas neste texto"]
}

Texto:\n\n`;

// ── MY STYLE PROFILE (Claudia Modell — 7 obras, 56k palavras) ─────────
const MY_STYLE = {
  author: "Claudia Modell",
  works: 7,
  total_words: 56657,
  metrics: [
    { id:"avgSent",    label:"Tamanho médio de frase",        unit:"palavras",  target:10.5,  lo:7,   hi:18,  desc:"Frases curtas e ágeis — seu ritmo natural" },
    { id:"shortSent",  label:'Frases muito curtas (< 5 pal.)', unit:"%",         target:16.4,  lo:0,   hi:35,  desc:"Você usa bastante frases de impacto curtas" },
    { id:"longSent",   label:'Frases longas (> 20 palavras)', unit:"%",         target:8.5,   lo:0,   hi:25,  desc:"Frases longas são exceção no seu estilo" },
    { id:"paraLen",    label:"Parágrafos curtos",             unit:"frases/§",  target:2.7,   lo:1,   hi:7,   desc:"Seus parágrafos são muito enxutos" },
    { id:"questions",  label:"Interrogações",                 unit:"por 1000",  target:16.1,  lo:0,   hi:35,  desc:"Muitas perguntas — traço marcante do seu estilo" },
    { id:"exclamat",   label:"Exclamações",                   unit:"por 1000",  target:3.5,   lo:0,   hi:15,  desc:"Você usa exclamações com parcimônia" },
    { id:"adverbs",    label:"Advérbios (-mente)",            unit:"por 1000",  target:10.6,  lo:0,   hi:25,  desc:"Uso moderado de advérbios" },
    { id:"wordLen",    label:"Tamanho médio de palavra",      unit:"letras",    target:5.08,  lo:4,   hi:7,   desc:"Vocabulário direto — palavras curtas" },
    { id:"masStart",   label:'"Mas" no início de frase',      unit:"%",         target:6.9,   lo:0,   hi:18,  desc:"Começar frases com Mas é uma marca sua" },
  ]
};

function calcStyleMetrics(text) {
  const sentences = (text.match(/[^.!?…\n]+[.!?…]+/g) || []).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 2);
  const words = (text.match(/\b[a-záàâãéèêíìîóòôõúùûüç]{2,}\b/gi) || []);
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.split(/\s+/).length >= 5);
  const wc = words.length || 1;
  const sc = sentences.length || 1;

  const sentLens = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgSent = sentLens.reduce((a, b) => a + b, 0) / sc;

  const paraLens = paras.map(p => (p.match(/[^.!?…]+[.!?…]+/g) || []).length);
  const avgPara = paraLens.reduce((a, b) => a + b, 0) / (paras.length || 1);

  const starters = sentences.map(s => s.trim().match(/^[a-záàâãéèêíìîóòôõúùûüç]+/i)?.[0]?.toLowerCase()).filter(Boolean);
  const masCount = starters.filter(w => w === "mas").length;

  return {
    avgSent:   Math.round(avgSent * 10) / 10,
    shortSent: Math.round(sentLens.filter(l => l < 5).length / sc * 100 * 10) / 10,
    longSent:  Math.round(sentLens.filter(l => l > 20).length / sc * 100 * 10) / 10,
    paraLen:   Math.round(avgPara * 10) / 10,
    questions: Math.round(((text.match(/\?/g) || []).length / wc) * 1000 * 10) / 10,
    exclamat:  Math.round(((text.match(/!/g) || []).length / wc) * 1000 * 10) / 10,
    adverbs:   Math.round(((text.match(/\b\w+mente\b/gi) || []).length / wc) * 1000 * 10) / 10,
    wordLen:   Math.round(words.reduce((a, w) => a + w.length, 0) / wc * 100) / 100,
    masStart:  Math.round(masCount / sc * 100 * 10) / 10,
  };
}

function metricSimilarity(current, target, lo, hi) {
  const range = hi - lo || 1;
  const diff = Math.abs(current - target);
  const pct = diff / range;
  return Math.max(0, Math.round(100 - pct * 150));
}

const MARKET_PROMPT = `Você é um especialista em mercado editorial e publicação independente via Amazon KDP no Brasil. Analise o trecho de texto abaixo e retorne APENAS um objeto JSON válido. Sem markdown, sem explicações, sem texto antes ou depois. Apenas o JSON puro.

Campos obrigatórios:
{
  "genero": "gênero principal",
  "subgenero": "subgênero específico",
  "confianca": 0-100,
  "audiencia": "público-alvo detalhado",
  "tom": "tom e atmosfera do texto",
  "tropos": ["até 5 tropos literários em português"],
  "temas": ["até 5 temas centrais em português"],
  "categorias_amazon": [
    { "path": "Kindle Store > Kindle eBooks > ...", "competicao": "Alta|Média|Baixa", "justificativa": "motivo" },
    { "path": "...", "competicao": "Alta|Média|Baixa", "justificativa": "motivo" },
    { "path": "...", "competicao": "Alta|Média|Baixa", "justificativa": "motivo" }
  ],
  "keywords_kdp": ["8 a 10 keywords que leitores usariam para buscar este livro"],
  "comp_titles": [
    { "titulo": "Nome do Livro", "autor": "Nome do Autor", "similaridade": "por que é comparável" },
    { "titulo": "...", "autor": "...", "similaridade": "..." },
    { "titulo": "...", "autor": "...", "similaridade": "..." }
  ],
  "posicionamento": "2 frases de posicionamento de mercado",
  "pontos_de_venda": ["3 a 4 pontos fortes para a descrição da Amazon"]
}

Texto:\n\n`;

const BIBLE_PROMPT = `Você é um assistente literário especializado em criar "bibles" de livros. Analise o texto abaixo e extraia as informações para preencher o bible do livro. Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois.

{
  "personagens": [
    {
      "nome": "nome do personagem",
      "papel": "protagonista|antagonista|secundário|figurante",
      "descricao_fisica": "aparência física detalhada conforme o texto",
      "personalidade": "traços de personalidade identificados",
      "arco": "desenvolvimento ou arco do personagem no texto",
      "detalhes": "outros detalhes relevantes: história, motivações, relações"
    }
  ],
  "locais": [
    {
      "nome": "nome do local",
      "tipo": "cidade|país|edificio|natural|outro",
      "descricao": "descrição detalhada conforme o texto",
      "importancia": "papel na narrativa"
    }
  ],
  "linha_do_tempo": [
    {
      "evento": "descrição do evento",
      "momento": "quando ocorre (capítulo, cena, período)",
      "personagens_envolvidos": ["nomes"]
    }
  ],
  "regras_de_mundo": [
    {
      "categoria": "magia|tecnologia|sociedade|historia|outro",
      "regra": "descrição da regra ou elemento do mundo"
    }
  ],
  "temas_centrais": ["lista de temas identificados"],
  "tom": "descrição do tom e atmosfera geral",
  "ponto_de_vista": "primeira pessoa|terceira pessoa limitada|terceira pessoa onisciente|outro",
  "resumo": "resumo do texto em 3-5 frases"
}

Texto:

`;


const KDP_PROMPT = (data, resumo) => `Voce e um especialista em publicacao independente na Amazon KDP Brasil e copywriter especializado em livros. Com base nos dados de mercado abaixo, crie os textos de venda do livro.

Retorne APENAS um objeto JSON valido, sem markdown, sem texto antes ou depois.

{
  "blurb": "string — sinopse de venda com 150-200 palavras. Estrutura: (1) gancho de abertura impactante; (2) protagonista e situacao inicial; (3) conflito central e o que esta em jogo; (4) promessa emocional sem revelar o final. Nunca use 'uma historia sobre'. Presente do indicativo. Em portugues.",
  "blurb_curto": "string — versao de 50-70 palavras para anuncios e redes sociais.",
  "a_plus_titulo": "string — titulo do modulo A+ (max 160 chars).",
  "a_plus_corpo": "string — texto do modulo A+ com 200-250 palavras. Foco em: por que este livro e diferente, experiencia emocional do leitor, para quem e ideal. Sem spoilers.",
  "bio_autor": "string — bio do autor em terceira pessoa, 80-100 palavras. Tom profissional mas calido. Genero em que escreve, o que torna a escrita unica, frase humana de conexao. Nao inclua dados biograficos reais.",
  "titulo_alternativo": "string — sugestao de titulo alternativo mais comercial",
  "subtitulo": "string — subtitulo opcional para KDP (max 200 chars) com keywords naturais",
  "serie": "string ou null — sugestao de nome de serie se o livro tiver potencial para sequencias"
}

Dados de mercado:
GENERO: ${data.genero}
SUBGENERO: ${data.subgenero}
PUBLICO-ALVO: ${data.audiencia}
TOM: ${data.tom}
TROPOS: ${(data.tropos||[]).join(', ')}
TEMAS: ${(data.temas||[]).join(', ')}
COMP TITLES: ${(data.comp_titles||[]).map(c=>c.titulo+' ('+c.autor+')').join(', ')}
POSICIONAMENTO: ${data.posicionamento}
PONTOS DE VENDA: ${(data.pontos_de_venda||[]).join(' | ')}
KEYWORDS KDP: ${(data.keywords_kdp||[]).join(', ')}

Resumo do texto:
${resumo}
`;

const CATS = [
  { name: "Visão Geral", reports: [
    { id:"scoreGeral", name:"Score Geral", color:"#9a7a35", isScore:true, desc:"Painel consolidado de qualidade do manuscrito" },
  ]},
  { name: "Escrita Forte", reports: [
    { id:"filler", name:"Filler Words", color:"#d97706", analyze:t=>findMatches(t,["apenas","realmente","basicamente","simplesmente","literalmente","exatamente","certamente","obviamente","praticamente","absolutamente","definitivamente","claramente","totalmente","completamente","especialmente"]), desc:"Palavras que não acrescentam valor ao texto" },
    { id:"passive", name:"Voz Passiva", color:"#dc2626", analyze:passiveVoice, desc:"Construções passivas que podem ser reescritas em voz ativa" },
    { id:"telling", name:"Show vs Tell", color:"#0891b2", analyze:t=>findMatches(t,["sentiu","sentia","pensou","pensava","achou","achava","percebeu","percebia","notou","notava","sabia","lembrou","imaginou","imaginava","desejou","temia","decidiu"]), desc:"Verbos que contam em vez de mostrar" },
    { id:"cliches", name:"Clichês", color:"#65a30d", analyze:t=>findMatches(t,["no final do dia","no fim das contas","luz no fim do túnel","coração partido","fazer de tripas coração","cair como uma luva","estamos no mesmo barco","na ponta da língua","de cabo a rabo","a mil por hora","no fundo do coração","de braços abertos"],true), desc:"Expressões gastas e previsíveis" },
  ]},
  { name:"Diálogo", reports:[
    { id:"tags", name:"Dialogue Tags", color:"#7c3aed", analyze:t=>findMatches(t,["disse","falou","respondeu","perguntou","exclamou","sussurrou","gritou","murmurou","declarou","afirmou","comentou","observou","acrescentou","continuou","replicou"]), desc:"Tags que podem se tornar batidas de ação" },
    { id:"adverbs", name:"Advérbios", color:"#db2777", analyze:adverbs, desc:"Advérbios em -mente que costumam enfraquecer as falas" },
  ]},
  { name:"Escolha de Palavras", reports:[
    { id:"generic", name:"Descrições Genéricas", color:"#ea580c", analyze:t=>findMatches(t,["bom","boa","bons","boas","ruim","ruins","mau","má","grande","grandes","pequeno","pequena","bonito","bonita","feio","feia","legal","legais","interessante","incrível","maravilhoso","horrível","terrível","lindo","linda"]), desc:"Palavras vagas que poderiam ser mais específicas" },
  ]},
  { name:"Repetição", reports:[
    { id:"echoes", name:"Word Echoes", color:"#2563eb", analyze:wordEchoes, desc:"Palavras iguais muito próximas uma da outra" },
  ]},
  { name:"Ritmo & Estrutura", reports:[
    { id:"pacingHeatmap", name:"Pacing Heatmap", color:"#7c3aed", isPacing:true, chart:analyzePacing, desc:"Mapa de calor do ritmo parágrafo a parágrafo" },
    { id:"sentVar", name:"Variação de Frases", color:"#9a7a35", chart:sentenceVariation, desc:"Comprimento das frases ao longo do texto" },
    { id:"wordFreq", name:"Frequência de Palavras", color:"#9a7a35", chart:wordFrequency, desc:"As palavras mais usadas no texto" },
    { id:"starters", name:"Inícios de Frase", color:"#9a7a35", chart:sentenceStarters, desc:"Com que palavra você começa suas frases" },
  ]},
  { name:"Análise com IA", reports:[
    { id:"aiCritique", name:"Crítica Editorial", color:"#7c3aed", isAI:true, prompt:"Você é um editor literário experiente. Analise o texto e forneça uma crítica construtiva detalhada. Foque em: estrutura narrativa, desenvolvimento de personagens, coerência, pontos fortes e sugestões de melhoria. Cite exemplos. Responda em português.\n\nTexto:\n\n", desc:"Feedback como um editor literário experiente" },
    { id:"betaReader", name:"Beta Reader", color:"#059669", isAI:true, prompt:"Você é um leitor beta, fã do gênero. Responda como leitor real: O que achou interessante? Onde perdeu o interesse? O texto prendeu? Algo ficou confuso? Informal, em português.\n\nTexto:\n\n", desc:"Simulação da reação de um leitor real" },
  ]},
  { name:"Market Fuel", reports:[
    { id:"marketFuel", name:"Market Fuel", color:"#0d9488", isMarketFuel:true, desc:"Gênero, categorias Amazon, tropos, keywords e comp titles" },
    { id:"kdpPublisher", name:"KDP Publisher", color:"#f97316", isKDP:true, desc:"Blurb, A+ content e bio do autor para publicar na Amazon" },
  ]},
  { name:"Detector de IA", reports:[
    { id:"aiVices", name:"Vícios de IA", color:"#dc2626", analyze:analyzeAiVices, desc:"Frases e conectores típicos de texto gerado por IA" },
    { id:"aiScore", name:"Score de IA", color:"#dc2626", isAiScore:true, desc:"Análise profunda: quão artificial soa o seu texto?" },
  ]},
  { name:"Meu Estilo", reports:[
    { id:"styleComp", name:"Comparador de Estilo", color:"#7c3aed", isStyleComp:true, desc:"Compara este texto com o perfil das suas 7 obras" },
  ]},
  { name:"Bible Keeper", reports:[
    { id:"bibleKeeper", name:"Bible Keeper", color:"#7c5c2e", isBible:true, desc:"Extrai e organiza personagens, locais, linha do tempo e regras de mundo" },
  ]},
];

const ALL = CATS.flatMap(c => c.reports);
const CHART_IDS = new Set(["sentVar","wordFreq","starters"]);
const SAMPLE = `A Maria sentiu uma dor estranha no peito quando viu o João do outro lado da rua. Ela pensou que era apenas coincidência, mas no fundo do coração sabia que não era. O homem era grande e bonito, com um sorriso maravilhoso que fazia o coração de qualquer pessoa acelerar completamente. Ela realmente não conseguia parar de pensar nele.

"Oi", disse ela, simplesmente.

"Oi", ele respondeu, sorrindo gentilmente.

Era como se o tempo literalmente tivesse parado naquele momento. Ela percebeu que estava apaixonada, ou pelo menos achava que estava. No final do dia, o amor é assim mesmo: um coração partido à espera de ser consertado.

Maria pensou que deveria falar mais alguma coisa. João pensou que deveria agir logo. Ele sentiu o peso do silêncio. Ela notou o nervosismo dele. Os dois perceberam que algo estava mudando entre eles.

"Você quer tomar um café?", perguntou ele, obviamente nervoso.

Ela achou que seria interessante. Era uma boa ideia. Um encontro pequeno, mas que poderia ter grandes consequências — ela sabia disso, certamente.`;

// ── MINI COMPONENTS ───────────────────────────────────────────────────
function HLText({ text, highlights, color }) {
  if (!highlights?.length) return <div style={{ whiteSpace:"pre-wrap", lineHeight:2 }}>{text}</div>;
  const sorted = [...highlights].sort((a,b)=>a.start-b.start);
  const segs=[]; let cur=0;
  for (const h of sorted) { if(h.start>cur) segs.push({t:text.slice(cur,h.start),hl:false}); const s=Math.max(h.start,cur); if(s<h.end){segs.push({t:text.slice(s,h.end),hl:true});cur=h.end;} }
  if(cur<text.length) segs.push({t:text.slice(cur),hl:false});
  return <div style={{whiteSpace:"pre-wrap",lineHeight:2}}>{segs.map((seg,i)=>seg.hl?<mark key={i} style={{backgroundColor:color+"22",borderBottom:`2px solid ${color}`,borderRadius:2,color:"inherit",padding:"1px 0"}}>{seg.t}</mark>:<span key={i}>{seg.t}</span>)}</div>;
}

function EditableHLText({ text, onChange, highlights, color }) {
  const textRef = useRef(null);
  const hlRef = useRef(null);
  const syncScroll = () => { if (hlRef.current && textRef.current) { hlRef.current.scrollTop = textRef.current.scrollTop; } };
  const sorted = highlights?.length ? [...highlights].sort((a,b)=>a.start-b.start) : [];
  const segs = [];
  if (sorted.length) {
    let cur = 0;
    for (const h of sorted) { if(h.start>cur) segs.push({t:text.slice(cur,h.start),hl:false}); const s=Math.max(h.start,cur); if(s<h.end){segs.push({t:text.slice(s,h.end),hl:true});cur=h.end;} }
    if(cur<text.length) segs.push({t:text.slice(cur),hl:false});
  }
  const shared = {fontFamily:'"Cormorant Garamond",Georgia,serif',fontSize:16,lineHeight:2,padding:"16px 20px",width:"100%",minHeight:"55vh",whiteSpace:"pre-wrap",wordWrap:"break-word",overflowWrap:"break-word",margin:0,border:"1px solid #e0dbd3",borderRadius:4,boxSizing:"border-box",letterSpacing:"normal"};
  return (
    <div style={{position:"relative"}}>
      <div ref={hlRef} aria-hidden="true" style={{...shared,position:"absolute",top:0,left:0,height:"100%",overflow:"hidden",pointerEvents:"none",color:"#28231e",backgroundColor:"#fff",zIndex:0}}>
        {sorted.length ? segs.map((seg,i)=>seg.hl?<mark key={i} style={{backgroundColor:color+"22",borderBottom:`2px solid ${color}`,borderRadius:2,color:"inherit",padding:"1px 0"}}>{seg.t}</mark>:<span key={i}>{seg.t}</span>) : text}
      </div>
      <textarea ref={textRef} value={text} onChange={onChange} onScroll={syncScroll} style={{...shared,position:"relative",resize:"none",outline:"none",backgroundColor:"transparent",color:"transparent",caretColor:"#28231e",zIndex:1}}/>
    </div>
  );
}

function ScoreBadge({ count, wc }) {
  const pct=wc?(count/wc)*100:0; const s=pct<0.3?95:pct<0.8?80:pct<2?60:pct<4?40:20;
  const c=s>=80?"#2e7d52":s>=50?"#b8880a":"#c0392b"; const label=s>=80?"Ótimo":s>=50?"Regular":"Atenção";
  return <div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:54,height:54,borderRadius:"50%",border:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"DM Mono",fontSize:15,color:c,flexShrink:0}}>{s}</div><div><div style={{fontFamily:"DM Mono",fontSize:11,color:c,marginBottom:2}}>{label}</div><div style={{fontFamily:"DM Mono",fontSize:10,color:"#9a9088"}}>{count} ocorrência{count!==1?"s":""}</div><div style={{fontFamily:"DM Mono",fontSize:10,color:"#9a9088"}}>{pct.toFixed(1)}% do texto</div></div></div>;
}

function SLabel({ children }) { return <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2.5,textTransform:"uppercase",marginBottom:10}}>{children}</div>; }
function MCard({ children, style }) { return <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"16px 18px",...style}}>{children}</div>; }
function CompBadge({ level }) {
  const m={Alta:{bg:"#fef2f2",c:"#b91c1c",b:"#fecaca"},Média:{bg:"#fffbeb",c:"#92400e",b:"#fde68a"},Baixa:{bg:"#f0fdf4",c:"#166534",b:"#bbf7d0"}};
  const s=m[level]||m["Média"];
  return <span style={{fontSize:10,fontFamily:"DM Mono",padding:"2px 8px",borderRadius:10,backgroundColor:s.bg,color:s.c,border:`1px solid ${s.b}`,whiteSpace:"nowrap"}}>{level}</span>;
}

// ── PACING UTILITIES ─────────────────────────────────────────────────
function paceToColor(pace) {
  if (pace < 22) return { bg:"#dbeafe", ring:"#3b82f6", label:"Muito Lento", text:"#1e40af" };
  if (pace < 42) return { bg:"#d1fae5", ring:"#10b981", label:"Lento",       text:"#065f46" };
  if (pace < 62) return { bg:"#fef9c3", ring:"#eab308", label:"Moderado",    text:"#713f12" };
  if (pace < 78) return { bg:"#fed7aa", ring:"#f97316", label:"Rápido",      text:"#7c2d12" };
                 return { bg:"#fecdd3", ring:"#ef4444", label:"Intenso",     text:"#7f1d1d" };
}

function PacingText({ paras }) {
  if (!paras?.length) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {paras.map((p, i) => {
        const c = paceToColor(p.pace);
        return (
          <div key={i} style={{ position:"relative", backgroundColor:c.bg, borderLeft:`3px solid ${c.ring}`, borderRadius:"0 4px 4px 0", padding:"10px 14px 10px 16px", lineHeight:1.9, fontSize:15, color:"#28231e", whiteSpace:"pre-wrap" }}>
            <div style={{ position:"absolute", top:8, right:10, fontFamily:"DM Mono", fontSize:9, color:c.text, backgroundColor:c.ring+"20", padding:"2px 7px", borderRadius:10, letterSpacing:1 }}>{p.pace} · {c.label}</div>
            {p.text}
          </div>
        );
      })}
    </div>
  );
}

function PacingPanel({ paras, setActiveId }) {
  const [hovered, setHovered] = useState(null);
  if (!paras?.length) return <div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Texto insuficiente — adicione mais parágrafos.</div>;

  const avg = Math.round(paras.reduce((s, p) => s + p.pace, 0) / paras.length);
  const slowest = paras.reduce((a, p) => p.pace < a.pace ? p : a);
  const fastest = paras.reduce((a, p) => p.pace > a.pace ? p : a);
  const avgC = paceToColor(avg);
  const chartData = paras.map(p => ({ n: p.i + 1, pace: p.pace }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        {[
          { label:"RITMO MÉDIO", value:avg, sub:avgC.label, color:avgC.ring },
          { label:"PARÁGRAFO MAIS LENTO", value:`#${slowest.i+1}`, sub:`pace ${slowest.pace}`, color:"#3b82f6" },
          { label:"PARÁGRAFO MAIS RÁPIDO", value:`#${fastest.i+1}`, sub:`pace ${fastest.pace}`, color:"#ef4444" },
        ].map(s => (
          <div key={s.label} style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"14px 16px"}}>
            <div style={{fontSize:8,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:8}}>{s.label}</div>
            <div style={{fontSize:26,fontFamily:"DM Mono",fontWeight:300,color:s.color,lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:11,color:"#9a9088",marginTop:4}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"12px 18px",display:"flex",alignItems:"center",gap:0}}>
        <span style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",marginRight:12}}>LENTO</span>
        {["#dbeafe","#d1fae5","#fef9c3","#fed7aa","#fecdd3"].map((c,i)=>(
          <div key={i} style={{flex:1,height:12,backgroundColor:c,borderRadius:i===0?"3px 0 0 3px":i===4?"0 3px 3px 0":0}}/>
        ))}
        <span style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",marginLeft:12}}>INTENSO</span>
      </div>

      {/* Heatmap blocks */}
      <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"16px 18px"}}>
        <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2.5,marginBottom:14,textTransform:"uppercase"}}>Mapa de Parágrafos — clique para navegar</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"flex-end"}}>
          {paras.map((p, i) => {
            const c = paceToColor(p.pace);
            const w = Math.max(18, Math.min(90, p.words * 1.8));
            const h = Math.max(28, Math.min(72, p.sentences * 10 + 18));
            const isHov = hovered === i;
            return (
              <div key={i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
                style={{width:w,height:h,backgroundColor:c.bg,border:`1.5px solid ${isHov?c.ring:"transparent"}`,borderRadius:3,cursor:"pointer",position:"relative",transition:"transform .15s, border .15s",transform:isHov?"scaleY(1.08)":"scaleY(1)",transformOrigin:"bottom"}}>
                {isHov && (
                  <div style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",backgroundColor:"#1e1b18",color:"#e8dcc8",borderRadius:5,padding:"8px 12px",fontSize:11,whiteSpace:"nowrap",maxWidth:240,zIndex:30,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",pointerEvents:"none"}}>
                    <div style={{fontFamily:"DM Mono",fontSize:9,color:c.bg,marginBottom:4}}>§{i+1} · {p.words} palavras · pace {p.pace}</div>
                    <div style={{lineHeight:1.5,whiteSpace:"normal",fontSize:11}}>{p.preview.slice(0,80)}{p.preview.length>80?"…":""}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Line chart */}
      <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"16px 18px"}}>
        <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2.5,marginBottom:12,textTransform:"uppercase"}}>Curva de Ritmo — ao longo do capítulo</div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={chartData} margin={{top:4,right:4,bottom:0,left:-30}}>
            <defs>
              <linearGradient id="paceGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6"/>
                <stop offset="40%" stopColor="#10b981"/>
                <stop offset="65%" stopColor="#eab308"/>
                <stop offset="85%" stopColor="#f97316"/>
                <stop offset="100%" stopColor="#ef4444"/>
              </linearGradient>
            </defs>
            <XAxis dataKey="n" tick={{fontSize:9,fill:"#b0a898",fontFamily:"DM Mono"}} label={{value:"parágrafos",position:"insideBottomRight",offset:-4,fontSize:9,fill:"#b0a898"}}/>
            <YAxis domain={[0,100]} tick={{fontSize:9,fill:"#b0a898",fontFamily:"DM Mono"}}/>
            <Tooltip contentStyle={{backgroundColor:"#fff",border:"1px solid #e0dbd3",fontFamily:"DM Mono",fontSize:10,borderRadius:3}} formatter={(v)=>[`pace ${v}`,""]}/>
            <Line type="monotone" dataKey="pace" stroke="#7c3aed" strokeWidth={2.5} dot={{r:3,fill:"#7c3aed",stroke:"#fff",strokeWidth:1.5}} activeDot={{r:5}}/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{marginTop:10,fontSize:11,fontFamily:"DM Mono",color:"#9a9088",display:"flex",gap:20}}>
          <span>Seções abaixo de 30 = <span style={{color:"#3b82f6"}}>contemplativos/descritivos</span></span>
          <span>Acima de 65 = <span style={{color:"#ef4444"}}>ação/diálogo intenso</span></span>
        </div>
      </div>

    </div>
  );
}

// ── STYLE COMPARATOR PANEL ────────────────────────────────────────────
function StyleComparatorPanel({ text }) {
  const current = calcStyleMetrics(text);

  const scored = MY_STYLE.metrics.map(m => {
    const cv = current[m.id];
    const sim = metricSimilarity(cv, m.target, m.lo, m.hi);
    const diff = cv - m.target;
    const diffPct = m.target ? Math.round((diff / m.target) * 100) : 0;
    return { ...m, current: cv, sim, diff: Math.round(diff * 10) / 10, diffPct };
  });

  const overall = Math.round(scored.reduce((s, m) => s + m.sim, 0) / scored.length);
  const oc = overall >= 75 ? "#2e7d52" : overall >= 50 ? "#9a7a35" : "#b8880a";
  const ol = overall >= 75 ? "Muito parecido" : overall >= 50 ? "Parcialmente seu" : "Diferente do usual";

  const R = 58, CIRC = 2 * Math.PI * R;

  const closest  = [...scored].sort((a, b) => b.sim - a.sim).slice(0, 3);
  const furthest = [...scored].sort((a, b) => a.sim - b.sim).slice(0, 3);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Hero */}
      <MCard>
        <div style={{ display:"flex", alignItems:"center", gap:28 }}>
          <div style={{ flexShrink:0 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={R} fill="none" stroke="#f2efe9" strokeWidth="12"/>
              <circle cx="70" cy="70" r={R} fill="none" stroke={oc} strokeWidth="12"
                strokeDasharray={`${CIRC*(overall/100)} ${CIRC*(1-overall/100)}`}
                strokeLinecap="round" transform="rotate(-90 70 70)"/>
              <text x="70" y="66" textAnchor="middle" fontFamily="DM Mono" fontSize="28" fill={oc} fontWeight="300">{overall}</text>
              <text x="70" y="82" textAnchor="middle" fontFamily="DM Mono" fontSize="8" fill="#b0a898" letterSpacing="1.5">SIMILAR</text>
            </svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:600, color:oc, marginBottom:6 }}>{ol}</div>
            <div style={{ fontSize:14, color:"#28231e", lineHeight:1.7, marginBottom:10 }}>
              Comparando com {MY_STYLE.works} obras suas — {MY_STYLE.total_words.toLocaleString()} palavras de referência.
            </div>
            <div style={{ display:"flex", gap:20 }}>
              {[
                ["PRÓXIMOS", "#2e7d52", scored.filter(m => m.sim >= 75).length],
                ["RAZOÁVEIS", "#9a7a35", scored.filter(m => m.sim >= 45 && m.sim < 75).length],
                ["DISTANTES", "#b8880a", scored.filter(m => m.sim < 45).length],
              ].map(([l, c, n]) => (
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"DM Mono", fontSize:22, color:c, lineHeight:1 }}>{n}</div>
                  <div style={{ fontFamily:"DM Mono", fontSize:8, color:"#b0a898", letterSpacing:1, marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MCard>

      {/* Metric comparison bars */}
      <MCard>
        <SLabel>Comparação métrica — seu estilo vs. este texto</SLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {scored.map(m => {
            const simColor = m.sim >= 75 ? "#2e7d52" : m.sim >= 45 ? "#9a7a35" : "#b8880a";
            const arrow = m.diff > 0 ? "▲" : m.diff < 0 ? "▼" : "●";
            const arrowColor = Math.abs(m.diffPct) <= 15 ? "#2e7d52" : Math.abs(m.diffPct) <= 40 ? "#9a7a35" : "#b8880a";
            // Position marker on a 0-100 scale relative to lo/hi
            const range = m.hi - m.lo;
            const targetPct = Math.min(95, Math.max(5, ((m.target - m.lo) / range) * 100));
            const currentPct = Math.min(95, Math.max(5, ((m.current - m.lo) / range) * 100));

            return (
              <div key={m.id}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:13, color:"#28231e" }}>{m.label}</span>
                    <span style={{ fontSize:11, color:"#b0a898", marginLeft:8, fontFamily:"DM Mono" }}>{m.unit}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:16, fontFamily:"DM Mono", fontSize:11 }}>
                    <span style={{ color:"#9a7a35" }}>Seu: {m.target}</span>
                    <span style={{ color:arrowColor }}>{arrow} {m.current}</span>
                    <span style={{ color:simColor, minWidth:28, textAlign:"right" }}>{m.sim}%</span>
                  </div>
                </div>
                {/* Track with two markers */}
                <div style={{ position:"relative", height:8, backgroundColor:"#f2efe9", borderRadius:4, overflow:"visible" }}>
                  {/* Track fill */}
                  <div style={{ height:"100%", borderRadius:4, backgroundColor:"#e8e2da" }}/>
                  {/* Your style marker (gold) */}
                  <div title={`Seu estilo: ${m.target} ${m.unit}`} style={{ position:"absolute", top:"50%", left:`${targetPct}%`, transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", backgroundColor:"#9a7a35", border:"2.5px solid #fff", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", zIndex:2 }}/>
                  {/* Current text marker */}
                  <div title={`Este texto: ${m.current} ${m.unit}`} style={{ position:"absolute", top:"50%", left:`${currentPct}%`, transform:"translate(-50%,-50%)", width:12, height:12, borderRadius:"50%", backgroundColor:simColor, border:"2px solid #fff", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", zIndex:1 }}/>
                </div>
                <div style={{ fontSize:10, fontFamily:"DM Mono", color:"#b0a898", marginTop:4, fontStyle:"italic" }}>{m.desc}</div>
              </div>
            );
          })}
          {/* Legend */}
          <div style={{ display:"flex", gap:16, paddingTop:10, borderTop:"1px solid #e0dbd3", fontFamily:"DM Mono", fontSize:10, color:"#b0a898" }}>
            <span><span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%", backgroundColor:"#9a7a35", marginRight:5, verticalAlign:"middle" }}/>Seu estilo</span>
            <span><span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%", backgroundColor:"#2e7d52", marginRight:5, verticalAlign:"middle" }}/>Este texto</span>
          </div>
        </div>
      </MCard>

      {/* Closest + furthest */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <MCard>
          <SLabel>Mais próximo do seu estilo</SLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {closest.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", backgroundColor:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:4 }}>
                <span style={{ color:"#2e7d52", fontSize:14 }}>✓</span>
                <div>
                  <div style={{ fontSize:13, color:"#28231e" }}>{m.label}</div>
                  <div style={{ fontSize:10, fontFamily:"DM Mono", color:"#6b7280" }}>Seu: {m.target} {m.unit} · Texto: {m.current}</div>
                </div>
              </div>
            ))}
          </div>
        </MCard>
        <MCard>
          <SLabel>Mais distante do seu estilo</SLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {furthest.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", backgroundColor:"#fffbeb", border:"1px solid #fde68a", borderRadius:4 }}>
                <span style={{ color:"#b8880a", fontSize:14 }}>!</span>
                <div>
                  <div style={{ fontSize:13, color:"#28231e" }}>{m.label}</div>
                  <div style={{ fontSize:10, fontFamily:"DM Mono", color:"#6b7280" }}>
                    Seu: {m.target} {m.unit} · Texto: {m.current}
                    {m.diffPct !== 0 && <span style={{ color: m.diffPct > 0 ? "#b8880a" : "#2e7d52" }}> ({m.diffPct > 0 ? "+" : ""}{m.diffPct}%)</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </MCard>
      </div>

    </div>
  );
}

// ── AI SCORE PANEL ────────────────────────────────────────────────────
function AiScorePanel({ data }) {
  const score = data.score ?? 50;
  const color = score < 25 ? "#2e7d52" : score < 50 ? "#9a7a35" : score < 72 ? "#b8880a" : "#c0392b";
  const trackColor = score < 25 ? "#d1fae5" : score < 50 ? "#fef9c3" : score < 72 ? "#fed7aa" : "#fecdd3";
  const R = 60, CIRC = 2 * Math.PI * R;

  const levelColors = {
    "Humano":           { bg:"#d1fae5", text:"#065f46", border:"#6ee7b7" },
    "Suspeito":         { bg:"#fef9c3", text:"#713f12", border:"#fde047" },
    "Provavelmente IA": { bg:"#fed7aa", text:"#7c2d12", border:"#fb923c" },
    "Claramente IA":    { bg:"#fecdd3", text:"#7f1d1d", border:"#f87171" },
  };
  const lc = levelColors[data.nivel] || levelColors["Suspeito"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Hero */}
      <MCard>
        <div style={{ display:"flex", alignItems:"center", gap:28 }}>
          {/* Donut */}
          <div style={{ flexShrink:0 }}>
            <svg width="144" height="144" viewBox="0 0 144 144">
              <circle cx="72" cy="72" r={R} fill="none" stroke="#f2efe9" strokeWidth="12"/>
              <circle cx="72" cy="72" r={R} fill="none" stroke={color} strokeWidth="12"
                strokeDasharray={`${CIRC*(score/100)} ${CIRC*(1-score/100)}`}
                strokeLinecap="round" transform="rotate(-90 72 72)"/>
              <text x="72" y="68" textAnchor="middle" fontFamily="DM Mono" fontSize="30" fill={color} fontWeight="300">{score}</text>
              <text x="72" y="85" textAnchor="middle" fontFamily="DM Mono" fontSize="8" fill="#b0a898" letterSpacing="1.5">DE 100</text>
            </svg>
          </div>
          {/* Info */}
          <div style={{ flex:1 }}>
            <span style={{ display:"inline-block", padding:"4px 14px", borderRadius:20, fontSize:13, fontFamily:"DM Mono", backgroundColor:lc.bg, color:lc.text, border:`1px solid ${lc.border}`, marginBottom:12, letterSpacing:0.5 }}>
              {data.nivel}
            </span>
            <div style={{ fontSize:15, color:"#28231e", lineHeight:1.75 }}>{data.diagnostico}</div>
          </div>
        </div>
        {/* Score bar */}
        <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid #e0dbd3" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"DM Mono", fontSize:9, color:"#b0a898", marginBottom:6, letterSpacing:1.5 }}>
            <span>HUMANO</span><span>SUSPEITO</span><span>PROVAVELMENTE IA</span><span>CLARAMENTE IA</span>
          </div>
          <div style={{ position:"relative", height:10, borderRadius:5, background:"linear-gradient(to right,#d1fae5,#fef9c3,#fed7aa,#fecdd3)", overflow:"visible" }}>
            <div style={{ position:"absolute", top:"50%", left:`${score}%`, transform:"translate(-50%,-50%)", width:16, height:16, borderRadius:"50%", backgroundColor:color, border:"2.5px solid #fff", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", transition:"left .4s" }}/>
          </div>
        </div>
      </MCard>

      {/* Padrões de IA + Pontos Humanos */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <MCard>
          <SLabel>Padrões de IA Detectados</SLabel>
          {data.padroes_ia?.length ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {data.padroes_ia.map((p, i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ color:"#dc2626", flexShrink:0, marginTop:1 }}>✕</span>
                  <span style={{ fontSize:13, color:"#28231e", lineHeight:1.5 }}>{p}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize:13, color:"#9a9088", fontStyle:"italic" }}>Nenhum padrão típico de IA detectado.</div>}
        </MCard>
        <MCard>
          <SLabel>Elementos Genuinamente Humanos</SLabel>
          {data.pontos_humanos?.length ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {data.pontos_humanos.map((p, i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ color:"#2e7d52", flexShrink:0, marginTop:1 }}>✓</span>
                  <span style={{ fontSize:13, color:"#28231e", lineHeight:1.5 }}>{p}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize:13, color:"#9a9088", fontStyle:"italic" }}>O texto parece ter poucos traços de escrita humana.</div>}
        </MCard>
      </div>

      {/* Trechos suspeitos */}
      {data.trechos_suspeitos?.length > 0 && (
        <MCard>
          <SLabel>Trechos que Soam Artificiais</SLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {data.trechos_suspeitos.map((t, i) => (
              <div key={i} style={{ padding:"10px 14px", backgroundColor:"#fef2f2", borderLeft:"3px solid #dc2626", borderRadius:"0 4px 4px 0", fontSize:14, color:"#28231e", fontStyle:"italic", lineHeight:1.6 }}>
                "{t}"
              </div>
            ))}
          </div>
        </MCard>
      )}

      {/* Como humanizar */}
      <MCard style={{ borderLeft:"3px solid #2e7d52" }}>
        <SLabel>Como Humanizar Este Texto</SLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {data.como_humanizar?.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:22, height:22, borderRadius:"50%", backgroundColor:"#d1fae5", border:"1px solid #6ee7b7", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"DM Mono", fontSize:11, color:"#065f46", flexShrink:0 }}>{i+1}</div>
              <span style={{ fontSize:14, color:"#28231e", lineHeight:1.6 }}>{s}</span>
            </div>
          ))}
        </div>
      </MCard>

    </div>
  );
}

// ── SCORE DASHBOARD ───────────────────────────────────────────────────
const SCORED_REPORTS = [
  { id:"filler",  name:"Filler Words",         color:"#d97706", weight:1,   cat:"Escrita Forte" },
  { id:"passive", name:"Voz Passiva",           color:"#dc2626", weight:1.5, cat:"Escrita Forte" },
  { id:"telling", name:"Show vs Tell",          color:"#0891b2", weight:1.5, cat:"Escrita Forte" },
  { id:"cliches", name:"Clichês",               color:"#65a30d", weight:1.5, cat:"Escrita Forte" },
  { id:"tags",    name:"Dialogue Tags",         color:"#7c3aed", weight:0.8, cat:"Diálogo" },
  { id:"adverbs", name:"Advérbios",             color:"#db2777", weight:0.8, cat:"Diálogo" },
  { id:"generic", name:"Descrições Genéricas",  color:"#ea580c", weight:1,   cat:"Escolha de Palavras" },
  { id:"echoes",  name:"Word Echoes",           color:"#2563eb", weight:1,   cat:"Repetição" },
];

function calcScore(count, wc) {
  if (!wc) return 100;
  const pct = (count / wc) * 100;
  if (pct < 0.3) return 95;
  if (pct < 0.8) return 80;
  if (pct < 2)   return 60;
  if (pct < 4)   return 40;
  return 20;
}

function ScoreDashboard({ cache, wc, setActiveId }) {
  const scored = SCORED_REPORTS.map(r => {
    const count = (cache[r.id] || []).length;
    return { ...r, count, score: calcScore(count, wc) };
  });

  const totalW = SCORED_REPORTS.reduce((s, r) => s + r.weight, 0);
  const overall = Math.round(scored.reduce((s, r) => s + r.score * r.weight, 0) / totalW);
  const oc = overall >= 80 ? "#2e7d52" : overall >= 60 ? "#9a7a35" : overall >= 40 ? "#b8880a" : "#c0392b";
  const ol = overall >= 80 ? "Excelente" : overall >= 60 ? "Bom" : overall >= 40 ? "Regular" : "Precisa de atenção";

  const priorities = [...scored].sort((a, b) => a.score - b.score).filter(r => r.score < 80);
  const sortedBars = [...scored].sort((a, b) => a.score - b.score);

  const R = 66, CIRC = 2 * Math.PI * R;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Hero card ── */}
      <div style={{ backgroundColor:"#fff", border:"1px solid #e0dbd3", borderRadius:8, padding:"24px 28px", display:"flex", alignItems:"center", gap:32 }}>
        {/* Donut SVG */}
        <div style={{ flexShrink:0 }}>
          <svg width="156" height="156" viewBox="0 0 156 156">
            <circle cx="78" cy="78" r={R} fill="none" stroke="#f2efe9" strokeWidth="13"/>
            <circle cx="78" cy="78" r={R} fill="none" stroke={oc} strokeWidth="13"
              strokeDasharray={`${CIRC*(overall/100)} ${CIRC*(1-overall/100)}`}
              strokeLinecap="round" transform="rotate(-90 78 78)"/>
            <text x="78" y="72" textAnchor="middle" fontFamily="DM Mono" fontSize="32" fill={oc} fontWeight="300">{overall}</text>
            <text x="78" y="91" textAnchor="middle" fontFamily="DM Mono" fontSize="8" fill="#b0a898" letterSpacing="2">DE 100</text>
          </svg>
        </div>
        {/* Summary */}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:28, fontWeight:600, color:oc, lineHeight:1.1, marginBottom:8 }}>{ol}</div>
          <div style={{ fontSize:14, color:"#9a9088", lineHeight:1.7, marginBottom:16 }}>
            {wc.toLocaleString()} palavras analisadas em 8 categorias de qualidade narrativa e estilo.
          </div>
          <div style={{ display:"flex", gap:28 }}>
            {[["ÓTIMOS","#2e7d52",scored.filter(r=>r.score>=80).length],["REGULARES","#b8880a",scored.filter(r=>r.score>=50&&r.score<80).length],["ATENÇÃO","#c0392b",scored.filter(r=>r.score<50).length]].map(([label,color,n])=>(
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"DM Mono", fontSize:26, color, lineHeight:1 }}>{n}</div>
                <div style={{ fontFamily:"DM Mono", fontSize:8, color:"#b0a898", letterSpacing:1, marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Score bars ── */}
      <div style={{ backgroundColor:"#fff", border:"1px solid #e0dbd3", borderRadius:8, padding:"20px 24px" }}>
        <div style={{ fontSize:9, fontFamily:"DM Mono", color:"#b0a898", letterSpacing:2.5, marginBottom:18, textTransform:"uppercase" }}>Score por Relatório</div>
        <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
          {sortedBars.map(r => {
            const sc = r.score >= 80 ? "#2e7d52" : r.score >= 50 ? "#b8880a" : "#c0392b";
            return (
              <div key={r.id} onClick={() => setActiveId(r.id)} style={{ cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:13, color:"#28231e" }}>{r.name}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    <span style={{ fontFamily:"DM Mono", fontSize:10, color:"#c0b8ae" }}>{r.count} ocorrência{r.count!==1?"s":""}</span>
                    <span style={{ fontFamily:"DM Mono", fontSize:13, color:sc, minWidth:30, textAlign:"right", fontWeight:400 }}>{r.score}</span>
                  </div>
                </div>
                <div style={{ height:6, backgroundColor:"#f2efe9", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ width:`${r.score}%`, height:"100%", backgroundColor:r.color, borderRadius:3 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Priority list ── */}
      {priorities.length > 0 && (
        <div style={{ backgroundColor:"#fff", border:"1px solid #e0dbd3", borderRadius:8, padding:"20px 24px" }}>
          <div style={{ fontSize:9, fontFamily:"DM Mono", color:"#b0a898", letterSpacing:2.5, marginBottom:16, textTransform:"uppercase" }}>O Que Corrigir Primeiro</div>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {priorities.slice(0, 4).map((r, i) => {
              const tipMap = {
                passive: "Reescreva em voz ativa — troca mais impacto ao texto.",
                telling: "Substitua por cenas, gestos e diálogos concretos.",
                cliches: "Crie imagens originais no lugar das expressões gastas.",
                filler: "Delete sem dó — o texto fica mais forte sem elas.",
                tags: "Use batidas de ação: ele sorriu / ela cruzou os braços.",
                adverbs: "Escolha um verbo mais preciso em vez do advérbio.",
                generic: "Seja específico — um nome, cor, tamanho real.",
                echoes: "Varie o vocabulário ou reestruture o parágrafo.",
              };
              return (
                <div key={r.id} onClick={() => setActiveId(r.id)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 14px", backgroundColor:"#faf8f5", borderRadius:6, border:"1px solid #e0dbd3", cursor:"pointer" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", backgroundColor:r.color+"12", border:`1px solid ${r.color}35`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"DM Mono", fontSize:12, color:r.color, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, color:"#28231e", marginBottom:2 }}>{r.name} <span style={{ fontFamily:"DM Mono", fontSize:10, color:r.score<50?"#c0392b":"#b8880a" }}>score {r.score}</span></div>
                    <div style={{ fontSize:12, color:"#9a9088", fontStyle:"italic" }}>{tipMap[r.id]}</div>
                  </div>
                  <span style={{ fontSize:10, color:"#c0b8ae", fontFamily:"DM Mono" }}>VER →</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {overall >= 80 && (
        <div style={{ backgroundColor:"#edf7f1", border:"1px solid #b8e0cb", borderRadius:6, padding:"14px 18px", color:"#2e7d52", fontFamily:"DM Mono", fontSize:12 }}>
          ✓ Texto com excelente qualidade técnica! Continue revisando antes de publicar.
        </div>
      )}
    </div>
  );
}

// ── MARKET FUEL PANEL ─────────────────────────────────────────────────
function MarketFuelPanel({ data }) {
  const cc = data.confianca>=75?"#2e7d52":data.confianca>=50?"#b8880a":"#c0392b";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Genre */}
      <MCard>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
          <div style={{flex:1}}>
            <SLabel>Gênero Detectado</SLabel>
            <div style={{fontSize:24,fontWeight:600,color:"#0d9488",lineHeight:1.2,marginBottom:4}}>{data.genero}</div>
            <div style={{fontSize:15,color:"#6b7280",fontStyle:"italic"}}>{data.subgenero}</div>
          </div>
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:30,fontFamily:"DM Mono",fontWeight:300,color:cc,lineHeight:1}}>{data.confianca}</div>
            <div style={{fontSize:8,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:1,marginTop:2}}>CONFIANÇA</div>
            <div style={{width:54,height:5,backgroundColor:"#f2efe9",borderRadius:3,marginTop:6,overflow:"hidden"}}><div style={{width:`${data.confianca}%`,height:"100%",backgroundColor:cc,borderRadius:3}}/></div>
          </div>
        </div>
        <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e0dbd3",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:5}}>PÚBLICO-ALVO</div><div style={{fontSize:14,color:"#28231e",lineHeight:1.5}}>{data.audiencia}</div></div>
          <div><div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:5}}>TOM</div><div style={{fontSize:14,color:"#28231e",lineHeight:1.5}}>{data.tom}</div></div>
        </div>
      </MCard>

      {/* Tropos + Temas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <MCard>
          <SLabel>Tropos Identificados</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {data.tropos?.map(t=><span key={t} style={{padding:"3px 11px",borderRadius:20,fontSize:12,fontFamily:'"Cormorant Garamond",Georgia,serif',color:"#6d28d9",backgroundColor:"#f5f3ff",border:"1px solid #ddd6fe"}}>{t}</span>)}
          </div>
        </MCard>
        <MCard>
          <SLabel>Temas Centrais</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {data.temas?.map(t=><span key={t} style={{padding:"3px 11px",borderRadius:20,fontSize:12,fontFamily:'"Cormorant Garamond",Georgia,serif',color:"#0e7490",backgroundColor:"#ecfeff",border:"1px solid #a5f3fc"}}>{t}</span>)}
          </div>
        </MCard>
      </div>

      {/* Amazon Categories */}
      <MCard>
        <SLabel>Categorias Amazon KDP — onde posicionar seu livro</SLabel>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {data.categorias_amazon?.map((cat,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 12px",backgroundColor:"#faf8f5",borderRadius:4,border:"1px solid #e0dbd3"}}>
              <div style={{width:24,height:24,borderRadius:"50%",backgroundColor:"#0d9488",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"DM Mono",fontSize:11,flexShrink:0,marginTop:1}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontFamily:"DM Mono",color:"#28231e",marginBottom:3,lineHeight:1.5}}>{cat.path}</div>
                <div style={{fontSize:13,color:"#6b7280",fontStyle:"italic"}}>{cat.justificativa}</div>
              </div>
              <CompBadge level={cat.competicao}/>
            </div>
          ))}
        </div>
        <div style={{marginTop:12,fontSize:10,fontFamily:"DM Mono",color:"#b0a898",display:"flex",gap:16}}>
          <span><span style={{color:"#b91c1c"}}>● Alta</span> = mais tráfego, mais difícil</span>
          <span><span style={{color:"#166534"}}>● Baixa</span> = mais fácil de rankear</span>
        </div>
      </MCard>

      {/* KDP Keywords */}
      <MCard>
        <SLabel>Keywords para Amazon KDP</SLabel>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {data.keywords_kdp?.map(k=>(
            <span key={k} style={{padding:"4px 13px",backgroundColor:"#f0fdfa",border:"1px solid #99f6e4",borderRadius:20,fontSize:13,color:"#0f766e",fontFamily:'"Cormorant Garamond",Georgia,serif'}}>{k}</span>
          ))}
        </div>
        <div style={{marginTop:10,padding:"8px 12px",backgroundColor:"#f0fdfa",borderRadius:4,fontSize:11,fontFamily:"DM Mono",color:"#0f766e"}}>
          💡 No KDP, você tem 7 campos de keyword. Cada campo aceita até 50 caracteres — pode usar frases, não só palavras.
        </div>
      </MCard>

      {/* Comp Titles */}
      <MCard>
        <SLabel>Comp Titles — títulos comparáveis</SLabel>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {data.comp_titles?.map((c,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 12px",borderRadius:4,backgroundColor:"#faf8f5",border:"1px solid #e0dbd3"}}>
              <div style={{fontSize:20,lineHeight:1,flexShrink:0,marginTop:2}}>📖</div>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"#28231e"}}>{c.titulo}</div>
                <div style={{fontSize:11,fontFamily:"DM Mono",color:"#9a9088",marginBottom:3}}>{c.autor}</div>
                <div style={{fontSize:13,color:"#6b7280",fontStyle:"italic"}}>{c.similaridade}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:10,padding:"8px 12px",backgroundColor:"#faf8f5",borderRadius:4,fontSize:11,fontFamily:"DM Mono",color:"#9a9088"}}>
          💡 Use na sinopse: "Para fãs de {data.comp_titles?.[0]?.autor} e {data.comp_titles?.[1]?.autor}..."
        </div>
      </MCard>

      {/* Positioning + Selling Points */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <MCard>
          <SLabel>Posicionamento de Mercado</SLabel>
          <div style={{fontSize:14,color:"#28231e",lineHeight:1.75}}>{data.posicionamento}</div>
        </MCard>
        <MCard>
          <SLabel>Pontos de Venda para a Descrição</SLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {data.pontos_de_venda?.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{color:"#0d9488",fontWeight:700,flexShrink:0}}>✓</span>
                <span style={{fontSize:14,color:"#28231e",lineHeight:1.5}}>{p}</span>
              </div>
            ))}
          </div>
        </MCard>
      </div>
    </div>
  );
}



// ── KDP PUBLISHER PANEL ──────────────────────────────────────────────
function KDPPublisherPanel({ data }) {
  const CARD="#ffffff", BORDER="#e0dbd3", SURFACE="#f2efe9";
  const ACC="#f97316";
  const [copied, setCopied] = useState({});

  function copy(key, val) {
    navigator.clipboard.writeText(val).then(()=>{
      setCopied(p=>({...p,[key]:true}));
      setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);
    });
  }

  function CopyBlock({label, val, id, tall=false}) {
    return (
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
          <button onClick={()=>copy(id,val)} style={{fontSize:9,fontFamily:"DM Mono",padding:"3px 10px",border:`1px solid ${BORDER}`,borderRadius:2,background:"none",color:copied[id]?"#2e7d52":"#9a9088",cursor:"pointer",letterSpacing:1}}>
            {copied[id]?"✓ COPIADO":"COPIAR"}
          </button>
        </div>
        <div style={{backgroundColor:SURFACE,border:`1px solid ${BORDER}`,borderRadius:4,padding:"14px 16px",fontSize:14,color:"#28231e",lineHeight:1.75,whiteSpace:"pre-wrap",fontFamily:"Cormorant Garamond,Georgia,serif",maxHeight:tall?"none":"120px",overflow:"auto"}}>
          {val}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Títulos */}
      <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${ACC}`,borderRadius:4,padding:"18px 20px"}}>
        <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>Títulos</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          {data.titulo_alternativo && (
            <div style={{padding:"12px 14px",backgroundColor:SURFACE,border:`1px solid ${BORDER}`,borderRadius:4}}>
              <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:1.5,marginBottom:6}}>TÍTULO ALTERNATIVO</div>
              <div style={{fontSize:15,color:"#28231e",fontWeight:600}}>{data.titulo_alternativo}</div>
            </div>
          )}
          {data.subtitulo && (
            <div style={{padding:"12px 14px",backgroundColor:SURFACE,border:`1px solid ${BORDER}`,borderRadius:4}}>
              <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:1.5,marginBottom:6}}>SUBTÍTULO KDP</div>
              <div style={{fontSize:14,color:"#28231e"}}>{data.subtitulo}</div>
            </div>
          )}
        </div>
        {data.serie && (
          <div style={{padding:"10px 14px",backgroundColor:"#fff7ed",border:"1px solid #fed7aa",borderRadius:4,fontSize:13,color:"#9a3412"}}>
            <span style={{fontFamily:"DM Mono",fontSize:9,letterSpacing:1.5}}>SUGESTÃO DE SÉRIE: </span>{data.serie}
          </div>
        )}
      </div>

      {/* Blurb principal */}
      <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${ACC}`,borderRadius:4,padding:"18px 20px"}}>
        <CopyBlock label="Sinopse (150-200 palavras) — campo Descrição do KDP" val={data.blurb} id="blurb" tall={true}/>
        <CopyBlock label="Sinopse curta (50-70 palavras) — anúncios e redes sociais" val={data.blurb_curto} id="blurb_curto"/>
      </div>

      {/* A+ Content */}
      <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${ACC}`,borderRadius:4,padding:"18px 20px"}}>
        <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>A+ Content</div>
        <CopyBlock label="Título do módulo A+" val={data.a_plus_titulo} id="aplus_titulo"/>
        <CopyBlock label="Corpo do módulo A+ (200-250 palavras)" val={data.a_plus_corpo} id="aplus_corpo" tall={true}/>
        <div style={{padding:"8px 12px",backgroundColor:"#fff7ed",border:"1px solid #fed7aa",borderRadius:4,fontSize:11,fontFamily:"DM Mono",color:"#9a3412"}}>
          💡 A+ Content fica disponível após 5 vendas. Acesse em KDP → Sua estante → A+ Content Manager.
        </div>
      </div>

      {/* Bio */}
      <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${ACC}`,borderRadius:4,padding:"18px 20px"}}>
        <CopyBlock label="Bio do autor — campo Sobre o Autor do KDP" val={data.bio_autor} id="bio" tall={true}/>
        <div style={{padding:"8px 12px",backgroundColor:SURFACE,border:`1px solid ${BORDER}`,borderRadius:4,fontSize:11,fontFamily:"DM Mono",color:"#9a9088"}}>
          💡 Personalize com seu nome, localização e redes sociais antes de publicar.
        </div>
      </div>

    </div>
  );
}

// ── BIBLE KEEPER PANEL ───────────────────────────────────────────────
function BibleKeeperPanel({ data, bibleTab, setBibleTab, bibleEdits, setBibleEdits, onSave }) {
  const CARD="#ffffff", BORDER="#e0dbd3", SURFACE="#f2efe9";
  const tabs = [
    { id:"personagens", label:"Personagens", icon:"◉" },
    { id:"locais", label:"Locais", icon:"◈" },
    { id:"linha_do_tempo", label:"Linha do Tempo", icon:"◇" },
    { id:"regras_de_mundo", label:"Mundo", icon:"◆" },
    { id:"geral", label:"Geral", icon:"◎" },
  ];

  const update = (path, val) => {
    setBibleEdits(prev => ({...prev, [path]: val}));
  };
  const get = (path, fallback) => bibleEdits[path] !== undefined ? bibleEdits[path] : fallback;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,borderBottom:`1px solid ${BORDER}`,paddingBottom:0}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setBibleTab(t.id)} style={{padding:"8px 16px",cursor:"pointer",background:"none",border:"none",borderBottom:bibleTab===t.id?"2px solid #7c5c2e":"2px solid transparent",fontFamily:"DM Mono",fontSize:11,color:bibleTab===t.id?"#7c5c2e":"#9a9088",letterSpacing:1,marginBottom:-1}}>
            {t.icon} {t.label.toUpperCase()}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={onSave} style={{padding:"6px 16px",backgroundColor:"#7c5c2e",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"DM Mono",fontSize:10,letterSpacing:1.5,marginBottom:4}}>✓ SALVAR</button>
      </div>

      {/* PERSONAGENS */}
      {bibleTab==="personagens" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {(data.personagens||[]).map((p,i)=>(
            <div key={i} style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid #7c5c2e`,borderRadius:4,padding:"16px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:36,height:36,borderRadius:"50%",backgroundColor:"#f2ede6",border:"1px solid #d4c4a8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>◉</div>
                <div style={{flex:1}}>
                  <input value={get(`p${i}_nome`,p.nome)} onChange={e=>update(`p${i}_nome`,e.target.value)} style={{fontSize:17,fontWeight:600,color:"#28231e",border:"none",outline:"none",background:"none",width:"100%",fontFamily:'"Cormorant Garamond",Georgia,serif'}}/>
                  <select value={get(`p${i}_papel`,p.papel)} onChange={e=>update(`p${i}_papel`,e.target.value)} style={{fontSize:11,fontFamily:"DM Mono",color:"#9a9088",border:"none",background:"none",outline:"none",cursor:"pointer"}}>
                    {["protagonista","antagonista","secundário","figurante"].map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {[
                {key:"descricao_fisica", label:"Aparência física", val:p.descricao_fisica},
                {key:"personalidade", label:"Personalidade", val:p.personalidade},
                {key:"arco", label:"Arco do personagem", val:p.arco},
                {key:"detalhes", label:"Detalhes & motivações", val:p.detalhes},
              ].map(({key,label,val})=>(
                <div key={key} style={{marginBottom:10}}>
                  <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>{label}</div>
                  <textarea value={get(`p${i}_${key}`,val||"")} onChange={e=>update(`p${i}_${key}`,e.target.value)} rows={2} style={{width:"100%",resize:"vertical",border:`1px solid ${BORDER}`,borderRadius:3,padding:"6px 10px",fontSize:14,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',lineHeight:1.6,outline:"none",backgroundColor:SURFACE}}/>
                </div>
              ))}
            </div>
          ))}
          {(!data.personagens||data.personagens.length===0)&&<div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Nenhum personagem identificado.</div>}
        </div>
      )}

      {/* LOCAIS */}
      {bibleTab==="locais" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {(data.locais||[]).map((l,i)=>(
            <div key={i} style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:"3px solid #0d9488",borderRadius:4,padding:"16px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:18}}>◈</span>
                <input value={get(`l${i}_nome`,l.nome)} onChange={e=>update(`l${i}_nome`,e.target.value)} style={{fontSize:16,fontWeight:600,color:"#28231e",border:"none",outline:"none",background:"none",flex:1,fontFamily:'"Cormorant Garamond",Georgia,serif'}}/>
                <span style={{fontSize:11,fontFamily:"DM Mono",color:"#9a9088",backgroundColor:SURFACE,padding:"2px 10px",borderRadius:10,border:`1px solid ${BORDER}`}}>{l.tipo}</span>
              </div>
              {[
                {key:"descricao", label:"Descrição", val:l.descricao},
                {key:"importancia", label:"Importância na narrativa", val:l.importancia},
              ].map(({key,label,val})=>(
                <div key={key} style={{marginBottom:8}}>
                  <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>{label}</div>
                  <textarea value={get(`l${i}_${key}`,val||"")} onChange={e=>update(`l${i}_${key}`,e.target.value)} rows={2} style={{width:"100%",resize:"vertical",border:`1px solid ${BORDER}`,borderRadius:3,padding:"6px 10px",fontSize:14,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',lineHeight:1.6,outline:"none",backgroundColor:SURFACE}}/>
                </div>
              ))}
            </div>
          ))}
          {(!data.locais||data.locais.length===0)&&<div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Nenhum local identificado.</div>}
        </div>
      )}

      {/* LINHA DO TEMPO */}
      {bibleTab==="linha_do_tempo" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(data.linha_do_tempo||[]).map((ev,i)=>(
            <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:"50%",backgroundColor:"#f2ede6",border:"2px solid #7c5c2e",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"DM Mono",fontSize:11,color:"#7c5c2e"}}>{i+1}</div>
                {i<(data.linha_do_tempo.length-1)&&<div style={{width:2,height:24,backgroundColor:"#e0dbd3",margin:"2px 0"}}/>}
              </div>
              <div style={{flex:1,backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:"12px 16px",marginBottom:4}}>
                <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:4}}>{get(`ev${i}_momento`,ev.momento||"")}</div>
                <textarea value={get(`ev${i}_evento`,ev.evento||"")} onChange={e=>update(`ev${i}_evento`,e.target.value)} rows={2} style={{width:"100%",resize:"vertical",border:"none",outline:"none",backgroundColor:"transparent",fontSize:14,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',lineHeight:1.6}}/>
                {ev.personagens_envolvidos?.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>{ev.personagens_envolvidos.map(n=><span key={n} style={{fontSize:11,padding:"1px 8px",backgroundColor:"#f2ede6",border:"1px solid #d4c4a8",borderRadius:10,color:"#7c5c2e",fontFamily:"DM Mono"}}>{n}</span>)}</div>}
              </div>
            </div>
          ))}
          {(!data.linha_do_tempo||data.linha_do_tempo.length===0)&&<div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Nenhum evento identificado.</div>}
        </div>
      )}

      {/* REGRAS DE MUNDO */}
      {bibleTab==="regras_de_mundo" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(data.regras_de_mundo||[]).map((r,i)=>(
            <div key={i} style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:"12px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
              <span style={{fontSize:10,fontFamily:"DM Mono",color:"#7c3aed",backgroundColor:"#f5f3ff",border:"1px solid #ddd6fe",padding:"2px 8px",borderRadius:10,flexShrink:0,marginTop:2}}>{r.categoria}</span>
              <textarea value={get(`r${i}_regra`,r.regra||"")} onChange={e=>update(`r${i}_regra`,e.target.value)} rows={2} style={{flex:1,resize:"vertical",border:"none",outline:"none",backgroundColor:"transparent",fontSize:14,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',lineHeight:1.6}}/>
            </div>
          ))}
          {(!data.regras_de_mundo||data.regras_de_mundo.length===0)&&<div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Nenhuma regra de mundo identificada.</div>}
        </div>
      )}

      {/* GERAL */}
      {bibleTab==="geral" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:"16px 20px"}}>
            <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>Resumo</div>
            <textarea value={get("resumo",data.resumo||"")} onChange={e=>update("resumo",e.target.value)} rows={4} style={{width:"100%",resize:"vertical",border:`1px solid ${BORDER}`,borderRadius:3,padding:"8px 12px",fontSize:15,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',lineHeight:1.8,outline:"none",backgroundColor:SURFACE}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {key:"tom", label:"Tom & Atmosfera", val:data.tom},
              {key:"ponto_de_vista", label:"Ponto de Vista", val:data.ponto_de_vista},
            ].map(({key,label,val})=>(
              <div key={key} style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:"14px 16px"}}>
                <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>{label}</div>
                <input value={get(key,val||"")} onChange={e=>update(key,e.target.value)} style={{width:"100%",border:"none",outline:"none",background:"none",fontSize:14,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif'}}/>
              </div>
            ))}
          </div>
          {data.temas_centrais?.length>0&&(
            <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:"14px 16px"}}>
              <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>Temas Centrais</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {data.temas_centrais.map(t=><span key={t} style={{padding:"3px 12px",backgroundColor:"#f2ede6",border:"1px solid #d4c4a8",borderRadius:20,fontSize:13,color:"#7c5c2e",fontFamily:'"Cormorant Garamond",Georgia,serif'}}>{t}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────
export default function App() {
  const [text, setText] = useState(()=>localStorage.getItem("manuscrit_text")||"");
  const [phase, setPhase] = useState(()=>localStorage.getItem("manuscrit_phase")||"input");
  const [activeId, setActiveId] = useState("scoreGeral");
  const [cache, setCache] = useState({});
  const [charts, setCharts] = useState({});
  const [aiRes, setAiRes] = useState({});
  const [marketData, setMarketData] = useState(null);
  const [aiScoreData, setAiScoreData] = useState(null);
  const [aiScoreLoad, setAiScoreLoad] = useState(false);
  const [aiScoreError, setAiScoreError] = useState(null);
  const [aiLoad, setAiLoad] = useState(false);
  const [marketLoad, setMarketLoad] = useState(false);
  const [marketError, setMarketError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editHL, setEditHL] = useState([]);
  const editTimerRef = useRef(null);
  const [kdpData, setKdpData] = useState(()=>{try{return JSON.parse(localStorage.getItem("manuscrit_kdp")||"null");}catch{return null;}});
  const [kdpLoad, setKdpLoad] = useState(false);
  const [kdpError, setKdpError] = useState(null);
  const [bibleData, setBibleData] = useState(()=>{try{return JSON.parse(localStorage.getItem("manuscrit_bible")||"null");}catch{return null;}});
  const [bibleLoad, setBibleLoad] = useState(false);
  const [bibleError, setBibleError] = useState(null);
  const [bibleTab, setBibleTab] = useState("personagens");
  const [bibleEdits, setBibleEdits] = useState({});

  const setTextPersist = (v) => { setText(v); localStorage.setItem("manuscrit_text", v); };
  const setPhasePersist = (v) => { setPhase(v); localStorage.setItem("manuscrit_phase", v); };

  useEffect(() => {
    if (!editMode) return;
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(() => {
      const r = ALL.find(rep => rep.id === activeId);
      setEditHL(r?.analyze ? r.analyze(text) : []);
    }, 300);
    return () => clearTimeout(editTimerRef.current);
  }, [text, editMode, activeId]);

  const [autoAnalyzed, setAutoAnalyzed] = useState(false);
  if (!autoAnalyzed && phase === "done" && text.trim() && Object.keys(cache).length === 0) {
    setAutoAnalyzed(true);
    setTimeout(() => {
      const c={}, ch={};
      ALL.forEach(r => { if(r.analyze) c[r.id]=r.analyze(text); if(r.chart) ch[r.id]=r.chart(text); });
      setCache(c); setCharts(ch);
    }, 50);
  }

  const wc = text.trim().split(/\s+/).filter(Boolean).length;
  const report = ALL.find(r => r.id === activeId);
  const isChart = CHART_IDS.has(activeId);
  const isAI = !!report?.isAI;
  const isMF = activeId === "marketFuel";
  const isSG = activeId === "scoreGeral";
  const isPacing = activeId === "pacingHeatmap";
  const isAiScore = activeId === "aiScore";
  const isStyleComp = activeId === "styleComp";
  const isBible = activeId === "bibleKeeper";
  const isKDP = activeId === "kdpPublisher";
  const pacingData = charts["pacingHeatmap"] || [];
  const highlights = cache[activeId] || [];
  const chartData = charts[activeId] || [];
  const totalIssues = Object.values(cache).reduce((s, a) => s + (a?.length || 0), 0);
  const BG="#faf8f5", SURFACE="#f2efe9", CARD="#ffffff", BORDER="#e0dbd3";

  async function runKDP() {
    if (!text.trim() || !marketData) return;
    setKdpLoad(true); setKdpError(null);
    try {
      const resumo = truncateForAI(text).slice(0, 2000);
      const prompt = KDP_PROMPT(marketData, resumo);
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:3000,messages:[{role:"user",content:prompt}]})});
      const d = await res.json();
      if (!res.ok) { setKdpError(`Erro ${res.status}: ${d.error?.message||JSON.stringify(d)}`); setKdpLoad(false); return; }
      const raw = d.content?.find(b=>b.type==="text")?.text||"";
      const parsed = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,"").trim());
      setKdpData(parsed);
      localStorage.setItem("manuscrit_kdp", JSON.stringify(parsed));
    } catch(e) { setKdpError(`Erro: ${e.message}`); }
    setKdpLoad(false);
  }

  async function runBible() {
    if (!text.trim()) return;
    setBibleLoad(true); setBibleError(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,messages:[{role:"user",content:BIBLE_PROMPT+truncateForAI(text)}]})});
      const d = await res.json();
      if (!res.ok) { setBibleError(`Erro ${res.status}: ${d.error?.message||JSON.stringify(d)}`); setBibleLoad(false); return; }
      const raw = d.content?.find(b=>b.type==="text")?.text||"";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setBibleData(parsed);
      setBibleEdits({});
      localStorage.setItem("manuscrit_bible", JSON.stringify(parsed));
    } catch(e) { setBibleError(`Erro: ${e.message}`); }
    setBibleLoad(false);
  }

  function analyze() {
    if (!text.trim()) return;
    const c={}, ch={};
    ALL.forEach(r => { if(r.analyze) c[r.id]=r.analyze(text); if(r.chart) ch[r.id]=r.chart(text); });
    setCache(c); setCharts(ch); setPhasePersist("done"); setActiveId("scoreGeral"); setEditMode(false);
  }

// Truncate text for AI calls — models handle ~120k chars comfortably
const AI_MAX_CHARS = 120000;
const truncateForAI = (t) => t.length > AI_MAX_CHARS
  ? t.slice(0, AI_MAX_CHARS) + '\n\n[Texto truncado para análise — primeiros 120.000 caracteres]'
  : t;

  async function runAI() {
    if (!text.trim()||!report?.prompt) return;
    setAiLoad(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:report.prompt+truncateForAI(text)}]})});
      const d = await res.json();
      if (!res.ok) { setAiRes(prev=>({...prev,[activeId]:`Erro ${res.status}: ${d.error?.message||JSON.stringify(d)}`})); setAiLoad(false); return; }
      const txt = d.content?.find(b=>b.type==="text")?.text||"Erro.";
      setAiRes(prev=>({...prev,[activeId]:txt}));
    } catch(e) { setAiRes(prev=>({...prev,[activeId]:`Erro: ${e.message}`})); }
    setAiLoad(false);
  }

  async function runMarketFuel() {
    if (!text.trim()) return;
    setMarketLoad(true); setMarketError(null); setMarketData(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,messages:[{role:"user",content:MARKET_PROMPT+truncateForAI(text)}]})});
      const d = await res.json();
      if (!res.ok) { setMarketError(`Erro ${res.status}: ${d.error?.message||JSON.stringify(d)}`); setMarketLoad(false); return; }
      const raw = d.content?.find(b=>b.type==="text")?.text||"";
      const clean = raw.replace(/```json|```/g,"").trim();
      setMarketData(JSON.parse(clean));
    } catch(e) { setMarketError(`Erro: ${e.message}`); }
    setMarketLoad(false);
  }

  async function runAiScore() {
    if (!text.trim()) return;
    setAiScoreLoad(true); setAiScoreError(null); setAiScoreData(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,messages:[{role:"user",content:AI_SCORE_PROMPT+truncateForAI(text)}]})});
      const d = await res.json();
      if (!res.ok) { setAiScoreError(`Erro ${res.status}: ${d.error?.message||JSON.stringify(d)}`); setAiScoreLoad(false); return; }
      const raw = d.content?.find(b=>b.type==="text")?.text||"";
      setAiScoreData(JSON.parse(raw.replace(/```json|```/g,"").trim()));
    } catch(e) { setAiScoreError(`Erro: ${e.message}`); }
    setAiScoreLoad(false);
  }

  return (
    <div style={{minHeight:"100vh",backgroundColor:BG,color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',display:"flex",flexDirection:"column"}}>

      {/* HEADER */}
      <header style={{borderBottom:`1px solid ${BORDER}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",backgroundColor:CARD,position:"sticky",top:0,zIndex:20,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontFamily:"DM Mono",fontSize:17,color:"#9a7a35",letterSpacing:5}}>MANUSCRIT</div>
          {phase==="done" && <>
            <span style={{color:"#d8d2ca"}}>|</span>
            <span style={{fontFamily:"DM Mono",fontSize:10,color:"#9a9088"}}>{wc.toLocaleString()} palavras</span>
            <span style={{color:"#d8d2ca"}}>·</span>
            <span style={{fontFamily:"DM Mono",fontSize:10,color:totalIssues>0?"#c8880a":"#2e7d52"}}>{totalIssues} {totalIssues===1?"problema":"problemas"}</span>
          </>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {phase==="done" && <button onClick={()=>{setPhasePersist("input");setCache({});setCharts({});setAiRes({});setMarketData(null);setAiScoreData(null);setActiveId("scoreGeral");setEditMode(false);}} style={{padding:"6px 14px",cursor:"pointer",fontSize:10,fontFamily:"DM Mono",letterSpacing:1.5,borderRadius:2,backgroundColor:"transparent",color:"#9a9088",border:`1px solid ${BORDER}`}}>NOVO TEXTO</button>}
          <button onClick={analyze} style={{padding:"7px 20px",cursor:"pointer",fontSize:10,fontFamily:"DM Mono",letterSpacing:1.5,borderRadius:2,backgroundColor:phase==="input"?"#9a7a35":"transparent",color:phase==="input"?"#fff":"#9a7a35",border:"1px solid #9a7a35"}}>{phase==="input"?"ANALISAR":"REANALISAR"}</button>
        </div>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden",height:"calc(100vh - 53px)"}}>

        {/* SIDEBAR */}
        {phase==="done" && (
          <aside style={{width:280,borderRight:`1px solid ${BORDER}`,overflowY:"auto",padding:"14px 0",flexShrink:0,backgroundColor:SURFACE}}>
            {CATS.map(cat=>(
              <div key={cat.name} style={{marginBottom:16}}>
                <div style={{padding:"2px 16px 7px",fontSize:8.5,letterSpacing:3,color:"#c0b8ae",fontFamily:"DM Mono",textTransform:"uppercase"}}>{cat.name}</div>
                {cat.reports.map(r=>{
                  const cnt=(cache[r.id]||[]).length; const active=activeId===r.id;
                  return (
                    <div key={r.id} onClick={()=>setActiveId(r.id)} style={{padding:"8px 16px",cursor:"pointer",backgroundColor:active?CARD:"transparent",borderLeft:active?`2px solid ${r.color}`:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"background .1s"}}>
                      <span style={{fontSize:13,color:active?"#28231e":"#8a8078"}}>{r.name}</span>
                      {r.analyze&&!r.isAI&&<span style={{fontSize:10,fontFamily:"DM Mono",color:cnt>0?r.color:"#d0c8be",backgroundColor:cnt>0?r.color+"15":"transparent",padding:"1px 7px",borderRadius:10}}>{cnt}</span>}
                      {r.isAI&&<span style={{fontSize:8,color:r.color,fontFamily:"DM Mono",letterSpacing:1}}>AI</span>}
                      {r.isAiScore&&<span style={{fontSize:8,color:"#dc2626",fontFamily:"DM Mono",letterSpacing:1}}>{aiScoreData?"✓":"AI"}</span>}
                      {r.isBible&&<span style={{fontSize:8,color:"#7c5c2e",fontFamily:"DM Mono",letterSpacing:1}}>{bibleData?"✓":"◉"}</span>}
                      {r.isKDP&&<span style={{fontSize:8,color:"#f97316",fontFamily:"DM Mono",letterSpacing:1}}>{kdpData?"✓":"KDP"}</span>}
                      {r.isStyleComp&&<span style={{fontSize:8,color:"#7c3aed",fontFamily:"DM Mono",letterSpacing:1}}>★</span>}
                      {r.isScore&&<span style={{fontSize:8,color:"#9a7a35",fontFamily:"DM Mono",letterSpacing:1}}>★</span>}
                      {r.chart&&<span style={{fontSize:8,color:r.isPacing?"#7c3aed":"#9a7a35",fontFamily:"DM Mono"}}>{r.isPacing?"HM":"CHT"}</span>}
                      {r.isMarketFuel&&<span style={{fontSize:8,fontFamily:"DM Mono",color:marketData?"#0d9488":"#c0b8ae"}}>{marketData?"✓":"AI"}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </aside>
        )}

        {/* MAIN */}
        <main style={{flex:1,display:"flex",flexDirection:phase==="done"?"row":"column",overflow:"hidden"}}>

          {/* TEXT PANE */}
          <div style={{flex:phase==="input"?1:1,overflow:"auto",padding:"28px 40px",backgroundColor:BG}}>
            {phase==="input" ? (
              <div>
                {!text&&<div style={{marginBottom:20}}><button onClick={()=>setText(SAMPLE)} style={{padding:"5px 14px",backgroundColor:"transparent",color:"#c0b8ae",border:`1px solid ${BORDER}`,borderRadius:2,cursor:"pointer",fontFamily:"DM Mono",fontSize:10,letterSpacing:1.5}}>CARREGAR TEXTO DE EXEMPLO</button></div>}
                <textarea value={text} onChange={e=>setTextPersist(e.target.value)} placeholder="Cole aqui o seu manuscrito ou capítulo para análise..." style={{width:"100%",minHeight:"65vh",resize:"none",border:"none",outline:"none",backgroundColor:"transparent",color:"#28231e",fontFamily:'"Cormorant Garamond",Georgia,serif',fontSize:17,lineHeight:2}}/>
              </div>
            ) : (
              <div style={{maxWidth:760,margin:"0 auto",fontSize:16,position:"relative"}}>
                {!editMode ? (
                  <>
                    <button onClick={()=>{setEditMode(true);setEditHL(cache[activeId]||[]);}} style={{position:"absolute",top:-8,right:0,background:"none",border:`1px solid ${BORDER}`,borderRadius:3,cursor:"pointer",fontFamily:"DM Mono",fontSize:9,color:"#9a9088",padding:"3px 10px",letterSpacing:1.5,zIndex:5}}>✎ EDITAR</button>
                    {isPacing
                      ? <PacingText paras={pacingData}/>
                      : (isAI||isMF||isSG||isAiScore||isStyleComp||isBible||isKDP)
                        ? <div style={{whiteSpace:"pre-wrap",lineHeight:2,fontStyle:"italic",color:"#b0a898"}}>{text}</div>
                        : <HLText text={text} highlights={isChart?[]:highlights} color={report?.color||"#9a7a35"}/>
                    }
                  </>
                ) : (
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"8px 14px",backgroundColor:"#fef9c3",border:"1px solid #fde047",borderRadius:4}}>
                      <span style={{fontFamily:"DM Mono",fontSize:11,color:"#713f12",flex:1}}>✎ Modo edição — os destaques atualizam em tempo real</span>
                      <button onClick={analyze} style={{padding:"5px 14px",backgroundColor:"#9a7a35",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"DM Mono",fontSize:10,letterSpacing:1.5}}>✓ CONCLUIR</button>
                      <button onClick={()=>setEditMode(false)} style={{padding:"5px 14px",backgroundColor:"transparent",color:"#9a9088",border:`1px solid ${BORDER}`,borderRadius:3,cursor:"pointer",fontFamily:"DM Mono",fontSize:10,letterSpacing:1.5}}>CANCELAR</button>
                    </div>
                    <EditableHLText text={text} onChange={e=>setTextPersist(e.target.value)} highlights={editHL} color={report?.color||"#9a7a35"}/>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RESULTS PANE */}
          {phase==="done" && (
            <div style={{flex:1,overflow:"auto",padding:"22px 40px",backgroundColor:SURFACE,borderLeft:`1px solid ${BORDER}`}}>
              <div style={{maxWidth:760,margin:"0 auto"}}>

                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",gap:18,marginBottom:22}}>
                  {!isAI&&!isChart&&!isMF&&!isSG&&!isPacing&&!isAiScore&&!isStyleComp&&!isBible&&!isKDP&&<ScoreBadge count={highlights.length} wc={wc}/>}
                  <div style={{flex:1}}>
                    <h2 style={{fontSize:26,fontWeight:600,color:report?.color,marginBottom:4,lineHeight:1.1}}>{report?.name}</h2>
                    <p style={{fontSize:14,color:"#9a9088",lineHeight:1.5}}>{report?.desc}</p>
                  </div>
                </div>

                {isSG && <ScoreDashboard cache={cache} wc={wc} setActiveId={setActiveId}/>}
                {isPacing && <PacingPanel paras={pacingData} setActiveId={setActiveId}/>}
                {isStyleComp && <StyleComparatorPanel text={text}/>}

                {/* KDP PUBLISHER */}
                {isKDP && (
                  kdpLoad ? (
                    <div style={{display:"flex",alignItems:"center",gap:14,color:"#9a9088",fontFamily:"DM Mono",fontSize:12,padding:"22px 20px",backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6}}>
                      <span style={{animation:"spin 1.5s linear infinite",display:"inline-block",color:"#f97316",fontSize:20}}>◈</span>
                      <div><div style={{color:"#28231e",marginBottom:4,fontSize:13}}>Gerando textos para o KDP...</div><div>Blurb, A+ content e bio do autor</div></div>
                    </div>
                  ) : !kdpData ? (
                    <div>
                      <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"18px 20px",marginBottom:16}}>
                        <div style={{fontSize:15,color:"#28231e",lineHeight:1.8,marginBottom:8}}>O KDP Publisher usa os dados do Market Fuel para criar todos os textos de venda do seu livro na Amazon.</div>
                        <div style={{fontSize:13,color:"#9a9088",lineHeight:1.6}}>Você recebe: sinopse completa · versão curta para anúncios · título alternativo · subtítulo com keywords · módulo A+ Content · bio do autor · sugestão de série.</div>
                        {!marketData && <div style={{marginTop:12,padding:"10px 14px",backgroundColor:"#fef9c3",border:"1px solid #fde047",borderRadius:4,fontSize:12,fontFamily:"DM Mono",color:"#713f12"}}>⚠ Rode o Market Fuel primeiro — o KDP Publisher usa esses dados.</div>}
                      </div>
                      {kdpError&&<div style={{backgroundColor:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"10px 14px",color:"#b91c1c",fontFamily:"DM Mono",fontSize:12,marginBottom:14}}>✕ {kdpError}</div>}
                      <button onClick={runKDP} disabled={!marketData} style={{padding:"12px 30px",cursor:marketData?"pointer":"not-allowed",backgroundColor:marketData?"#f97316":"#e0dbd3",color:"#fff",border:"none",borderRadius:4,fontFamily:"DM Mono",fontSize:11,letterSpacing:2}}>◈ GERAR TEXTOS KDP</button>
                    </div>
                  ) : (
                    <div>
                      <KDPPublisherPanel data={kdpData}/>
                      <div style={{marginTop:16,display:"flex",gap:10}}>
                        <button onClick={()=>{setKdpData(null);runKDP();}} style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",background:"none",border:"1px solid #e0dbd3",padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>↺ REANALISAR</button>
                        <button onClick={()=>{localStorage.removeItem("manuscrit_kdp");setKdpData(null);}} style={{fontSize:10,fontFamily:"DM Mono",color:"#dc2626",background:"none",border:"1px solid #fecaca",padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>✕ LIMPAR</button>
                      </div>
                    </div>
                  )
                )}

                {/* BIBLE KEEPER */}
                {isBible && (
                  bibleLoad ? (
                    <div style={{display:"flex",alignItems:"center",gap:14,color:"#9a9088",fontFamily:"DM Mono",fontSize:12,padding:"22px 20px",backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6}}>
                      <span style={{animation:"spin 1.5s linear infinite",display:"inline-block",color:"#7c5c2e",fontSize:20}}>◉</span>
                      <div><div style={{color:"#28231e",marginBottom:4,fontSize:13}}>Construindo o Bible do livro...</div><div>Extraindo personagens, locais, linha do tempo e regras de mundo</div></div>
                    </div>
                  ) : !bibleData ? (
                    <div>
                      <div style={{backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6,padding:"18px 20px",marginBottom:16}}>
                        <div style={{fontSize:15,color:"#28231e",lineHeight:1.8,marginBottom:8}}>O Bible Keeper lê o seu texto e monta automaticamente o documento de referência do livro.</div>
                        <div style={{fontSize:13,color:"#9a9088",lineHeight:1.6}}>Você recebe: ficha completa de cada personagem · descrição dos locais · linha do tempo dos eventos · regras de mundo · tom, ponto de vista e temas centrais. Tudo editável e salvo localmente.</div>
                      </div>
                      {bibleError&&<div style={{backgroundColor:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"10px 14px",color:"#b91c1c",fontFamily:"DM Mono",fontSize:12,marginBottom:14}}>✕ {bibleError}</div>}
                      <button onClick={runBible} style={{padding:"12px 30px",cursor:"pointer",backgroundColor:"#7c5c2e",color:"#fff",border:"none",borderRadius:4,fontFamily:"DM Mono",fontSize:11,letterSpacing:2}}>◉ CONSTRUIR BIBLE</button>
                    </div>
                  ) : (
                    <div>
                      <BibleKeeperPanel
                        data={bibleData}
                        bibleTab={bibleTab}
                        setBibleTab={setBibleTab}
                        bibleEdits={bibleEdits}
                        setBibleEdits={setBibleEdits}
                        onSave={()=>{
                          const merged = JSON.parse(JSON.stringify(bibleData));
                          Object.entries(bibleEdits).forEach(([k,v])=>{
                            const m = k.match(/^p(\d+)_(.*)/);
                            const ml = k.match(/^l(\d+)_(.*)/);
                            const me = k.match(/^ev(\d+)_(.*)/);
                            const mr = k.match(/^r(\d+)_(.*)/);
                            if(m&&merged.personagens?.[+m[1]]) merged.personagens[+m[1]][m[2]]=v;
                            else if(ml&&merged.locais?.[+ml[1]]) merged.locais[+ml[1]][ml[2]]=v;
                            else if(me&&merged.linha_do_tempo?.[+me[1]]) merged.linha_do_tempo[+me[1]][me[2]]=v;
                            else if(mr&&merged.regras_de_mundo?.[+mr[1]]) merged.regras_de_mundo[+mr[1]][mr[2]]=v;
                            else merged[k]=v;
                          });
                          setBibleData(merged);
                          setBibleEdits({});
                          localStorage.setItem("manuscrit_bible",JSON.stringify(merged));
                        }}
                      />
                      <div style={{marginTop:16,display:"flex",gap:10}}>
                        <button onClick={()=>{setBibleData(null);setBibleEdits({});runBible();}} style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",background:"none",border:"1px solid #e0dbd3",padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>↺ REANALISAR</button>
                        <button onClick={()=>{localStorage.removeItem("manuscrit_bible");setBibleData(null);setBibleEdits({});}} style={{fontSize:10,fontFamily:"DM Mono",color:"#dc2626",background:"none",border:"1px solid #fecaca",padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>✕ LIMPAR BIBLE</button>
                      </div>
                    </div>
                  )
                )}

                {/* AI SCORE */}
                {isAiScore && (
                  aiScoreLoad ? (
                    <div style={{display:"flex",alignItems:"center",gap:14,color:"#9a9088",fontFamily:"DM Mono",fontSize:12,padding:"22px 20px",backgroundColor:"#fff",border:"1px solid #e0dbd3",borderRadius:6}}>
                      <span style={{animation:"spin 1.5s linear infinite",display:"inline-block",color:"#dc2626",fontSize:20}}>◈</span>
                      <div><div style={{color:"#28231e",marginBottom:4,fontSize:13}}>Analisando traços de IA no texto...</div><div>Buscando padrões, conectores e estruturas artificiais</div></div>
                    </div>
                  ) : !aiScoreData ? (
                    <div>
                      <MCard style={{marginBottom:16}}>
                        <div style={{fontSize:15,color:"#28231e",lineHeight:1.8,marginBottom:8}}>A IA lê o seu texto e devolve um score de 0 a 100 indicando o quanto ele parece gerado por modelo.</div>
                        <div style={{fontSize:13,color:"#9a9088",lineHeight:1.6}}>Você recebe: score e nível de suspeita · padrões de IA encontrados · trechos que soam artificiais · elementos genuinamente humanos · sugestões concretas para humanizar.</div>
                      </MCard>
                      {aiScoreError && <div style={{backgroundColor:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"10px 14px",color:"#b91c1c",fontFamily:"DM Mono",fontSize:12,marginBottom:14}}>✕ {aiScoreError}</div>}
                      <button onClick={runAiScore} style={{padding:"12px 30px",cursor:"pointer",backgroundColor:"#dc2626",color:"#fff",border:"none",borderRadius:4,fontFamily:"DM Mono",fontSize:11,letterSpacing:2}}>◈ ANALISAR AGORA</button>
                    </div>
                  ) : (
                    <div>
                      <AiScorePanel data={aiScoreData}/>
                      <div style={{marginTop:16}}><button onClick={()=>{setAiScoreData(null);runAiScore();}} style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",background:"none",border:"1px solid #e0dbd3",padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>↺ REANALISAR</button></div>
                    </div>
                  )
                )}

                {/* MARKET FUEL */}
                {isMF && (
                  marketLoad ? (
                    <div style={{display:"flex",alignItems:"center",gap:16,color:"#9a9088",fontFamily:"DM Mono",fontSize:12,padding:"22px 20px",backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:6}}>
                      <span style={{animation:"spin 1.5s linear infinite",display:"inline-block",color:"#0d9488",fontSize:22}}>◈</span>
                      <div><div style={{color:"#28231e",marginBottom:4,fontSize:13}}>Analisando o mercado editorial...</div><div>Detectando gênero, tropos, categorias Amazon, keywords e comp titles</div></div>
                    </div>
                  ) : !marketData ? (
                    <div>
                      <MCard style={{marginBottom:16}}>
                        <div style={{fontSize:15,color:"#28231e",lineHeight:1.8,marginBottom:8}}>O Market Fuel identifica onde seu livro se encaixa no mercado e como posicioná-lo para vender mais na Amazon.</div>
                        <div style={{fontSize:13,color:"#9a9088",lineHeight:1.6}}>Você vai receber: gênero e subgênero · nível de confiança · público-alvo · tropos e temas · 3 categorias Amazon com competição · keywords para KDP · comp titles · posicionamento e pontos de venda.</div>
                      </MCard>
                      {marketError&&<div style={{backgroundColor:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"10px 14px",color:"#b91c1c",fontFamily:"DM Mono",fontSize:12,marginBottom:14}}>✕ {marketError}</div>}
                      <button onClick={runMarketFuel} style={{padding:"12px 30px",cursor:"pointer",backgroundColor:"#0d9488",color:"#fff",border:"none",borderRadius:4,fontFamily:"DM Mono",fontSize:11,letterSpacing:2}}>◈ ANALISAR MERCADO</button>
                    </div>
                  ) : (
                    <div>
                      <MarketFuelPanel data={marketData}/>
                      <div style={{marginTop:16}}><button onClick={()=>{setMarketData(null);runMarketFuel();}} style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",background:"none",border:`1px solid ${BORDER}`,padding:"5px 14px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>↺ REANALISAR</button></div>
                    </div>
                  )
                )}

                {/* AI */}
                {isAI && (aiLoad?<div style={{display:"flex",alignItems:"center",gap:12,color:"#9a9088",fontFamily:"DM Mono",fontSize:12,padding:18,backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4}}><span style={{animation:"spin 2s linear infinite",display:"inline-block",color:report.color}}>◈</span>Analisando...</div>:!aiRes[activeId]?<div><p style={{fontSize:14,color:"#9a9088",marginBottom:16,lineHeight:1.6}}>A IA vai fornecer uma análise detalhada como um {activeId==="aiCritique"?"editor literário":"leitor beta"}.</p><button onClick={runAI} style={{padding:"11px 26px",cursor:"pointer",backgroundColor:report.color+"10",color:report.color,border:`1px solid ${report.color}40`,borderRadius:4,fontFamily:"DM Mono",fontSize:11,letterSpacing:1.5}}>✦ INICIAR ANÁLISE COM IA</button></div>:<div><div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${report.color}`,borderRadius:4,padding:"18px 20px",lineHeight:1.85,fontSize:15,color:"#28231e",whiteSpace:"pre-wrap",marginBottom:12}}>{aiRes[activeId]}</div><button onClick={runAI} style={{fontSize:10,fontFamily:"DM Mono",color:"#b0a898",background:"none",border:`1px solid ${BORDER}`,padding:"5px 12px",cursor:"pointer",borderRadius:2,letterSpacing:1}}>↺ REANALISAR</button></div>)}

                {/* CHART (sentVar / wordFreq / starters only — not pacing) */}
                {isChart&&!isPacing&&chartData.length>0&&(
                  <div style={{backgroundColor:CARD,border:`1px solid ${BORDER}`,borderRadius:4,padding:20}}>
                    <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2.5,marginBottom:18,textTransform:"uppercase"}}>{activeId==="sentVar"?"Comprimento das Frases (palavras)":activeId==="wordFreq"?"Palavras Mais Frequentes":"Inícios de Frase"}</div>
                    {activeId==="sentVar"?(
                      <><ResponsiveContainer width="100%" height={130}><BarChart data={chartData} margin={{top:0,right:0,bottom:0,left:-25}}><XAxis dataKey="i" hide/><YAxis tick={{fontSize:10,fill:"#b0a898",fontFamily:"DM Mono"}}/><Tooltip contentStyle={{backgroundColor:"#fff",border:"1px solid #e0dbd3",fontFamily:"DM Mono",fontSize:10,borderRadius:3}} formatter={(v,_,p)=>[`${v} palavras`,p.payload.preview]}/><Bar dataKey="len" radius={[2,2,0,0]}>{chartData.map((d,i)=><Cell key={i} fill={d.len<5?"#dc2626":d.len>30?"#2563eb":"#d97706"}/>)}</Bar></BarChart></ResponsiveContainer>
                      <div style={{display:"flex",gap:20,marginTop:12,fontFamily:"DM Mono",fontSize:10,color:"#b0a898"}}><span>● <span style={{color:"#dc2626"}}>curta</span> (&lt;5)</span><span>● <span style={{color:"#d97706"}}>normal</span></span><span>● <span style={{color:"#2563eb"}}>longa</span> (&gt;30)</span></div>
                      <div style={{marginTop:14,display:"flex",gap:24,fontFamily:"DM Mono",fontSize:11,color:"#9a9088",paddingTop:14,borderTop:`1px solid ${BORDER}`}}><span>Média: <span style={{color:"#9a7a35"}}>{Math.round(chartData.reduce((s,d)=>s+d.len,0)/chartData.length)} pal.</span></span><span>Máx: <span style={{color:"#2563eb"}}>{Math.max(...chartData.map(d=>d.len))} pal.</span></span><span>Mín: <span style={{color:"#dc2626"}}>{Math.min(...chartData.map(d=>d.len))} pal.</span></span></div></>
                    ):(
                      <ResponsiveContainer width="100%" height={Math.max(180,chartData.length*22)}><BarChart data={chartData} layout="vertical" margin={{top:0,right:20,bottom:0,left:10}}><XAxis type="number" tick={{fontSize:10,fill:"#b0a898",fontFamily:"DM Mono"}}/><YAxis type="category" dataKey="word" width={90} tick={{fontSize:13,fill:"#28231e",fontFamily:'"Cormorant Garamond"'}}/><Tooltip contentStyle={{backgroundColor:"#fff",border:"1px solid #e0dbd3",fontFamily:"DM Mono",fontSize:10,borderRadius:3}}/><Bar dataKey="count" fill={activeId==="wordFreq"?"#9a7a35":"#7c3aed"} radius={[0,3,3,0]}/></BarChart></ResponsiveContainer>
                    )}
                  </div>
                )}

                {/* ISSUES */}
                {!isAI&&!isChart&&!isMF&&!isSG&&!isPacing&&!isAiScore&&!isStyleComp&&highlights.length>0&&(
                  <div style={{marginTop:18}}>
                    <div style={{fontSize:9,fontFamily:"DM Mono",color:"#b0a898",letterSpacing:2.5,marginBottom:12,textTransform:"uppercase"}}>Ocorrências encontradas</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {(()=>{const f={};highlights.forEach(h=>{const w=h.word.toLowerCase();f[w]=(f[w]||0)+1;});return Object.entries(f).sort((a,b)=>b[1]-a[1]).map(([w,c])=><span key={w} style={{padding:"4px 13px",backgroundColor:report.color+"10",border:`1px solid ${report.color}30`,borderRadius:20,fontSize:14,color:"#28231e"}}>{w} <span style={{fontFamily:"DM Mono",fontSize:10,color:report.color}}>×{c}</span></span>);})()}
                    </div>
                  </div>
                )}
                {!isAI&&!isChart&&!isMF&&!isSG&&!isPacing&&!isAiScore&&!isStyleComp&&highlights.length===0&&<div style={{backgroundColor:"#edf7f1",border:"1px solid #b8e0cb",borderRadius:4,padding:"14px 18px",color:"#2e7d52",fontFamily:"DM Mono",fontSize:12}}>✓ Nenhuma ocorrência encontrada. Excelente!</div>}
                {isChart&&!isPacing&&chartData.length===0&&<div style={{color:"#b0a898",fontFamily:"DM Mono",fontSize:12,padding:16}}>Texto insuficiente para gerar este relatório.</div>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
