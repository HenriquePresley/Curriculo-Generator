// Versão online (sem servidor): faz no próprio navegador o que o server.js faz no PC.
// Cada pessoa usa a própria chave do Gemini, e tudo fica salvo só neste aparelho (localStorage).
(function () {
  const { montarPrompt, ESQUEMA, PROMPT_VAGAS, ESQUEMA_VAGAS, PROMPT_TRIAGEM, ESQUEMA_TRIAGEM, PROMPT_MONTAR, ESQUEMA_MONTAR } = window.Prompts;
  const { validar, compatibilidade } = window.Validacao;

  // ---------- armazenamento no aparelho ----------
  const PREFIXO = 'adaptador:';
  const ler = (chave, padrao) => {
    try { const v = localStorage.getItem(PREFIXO + chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; }
  };
  const salvar = (chave, valor) => {
    try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); }
    catch { throw new Error('O armazenamento do navegador está cheio. Apague adaptações antigas do histórico.'); }
  };
  const MAX_HISTORICO = 30;

  const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- Gemini direto do navegador ----------
  const MODELOS_PADRAO = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  const TEMPO_LIMITE_MS = 45000;
  const pausados = new Map();

  async function modelosDisponiveis(chave) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': chave } });
      const j = await r.json();
      return (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(n => /flash/.test(n) && !/(image|tts|live|audio|thinking|exp|preview)/.test(n))
        .sort().reverse()
        .sort((a, b) => /lite/.test(a) - /lite/.test(b));
    } catch { return []; }
  }

  async function chamarGemini(chave, modelo, partes, esquema) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify({ contents: [{ role: 'user', parts: partes }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: esquema } }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      const e = new Error(navigator.onLine === false ? 'Sem internet no aparelho.' : `O modelo ${modelo} não respondeu a tempo.`);
      e.status = 504;
      throw e;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error?.message || `Erro ${r.status} da API do Gemini`); e.status = r.status; throw e; }
    const texto = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!texto) throw new Error('A IA não retornou conteúdo. Tente de novo.');
    return JSON.parse(texto);
  }

  async function gerar(partes, esquema) {
    const cfg = ler('config', {});
    if (!cfg.apiKey) throw new Error('Configure sua chave gratuita do Google Gemini primeiro (passo 1).');
    let fila = [cfg.modelo || MODELOS_PADRAO[0], ...MODELOS_PADRAO];
    const agora = Date.now();
    fila.sort((a, b) => ((pausados.get(a) || 0) > agora) - ((pausados.get(b) || 0) > agora));
    let ultimoErro, buscouLista = false;
    const tentados = new Set();
    while (fila.length) {
      const modelo = fila.shift();
      if (tentados.has(modelo)) continue;
      tentados.add(modelo);
      try {
        return { resultado: await chamarGemini(cfg.apiKey, modelo, partes, esquema), modelo };
      } catch (e) {
        ultimoErro = e;
        if ([429, 503, 504].includes(e.status)) pausados.set(modelo, Date.now() + 5 * 60 * 1000);
        if (e.status === 400 && /api key/i.test(e.message)) throw new Error('A chave do Gemini é inválida. Confira no passo 1.');
        if (![404, 429, 500, 503, 504].includes(e.status)) break;
        if (!fila.length && !buscouLista) { buscouLista = true; fila = await modelosDisponiveis(cfg.apiKey); }
      }
    }
    if (ultimoErro?.status === 429) throw new Error('Limite gratuito da IA atingido por agora. Espere um minuto e tente de novo.');
    throw ultimoErro;
  }

  const partesComImagens = (texto, imagens) =>
    [{ text: texto }, ...imagens.map(img => ({ inline_data: { mime_type: img.mime, data: img.data } }))];

  // ---------- histórico ----------
  const lerHistorico = () => ler('historico', []);
  function guardarNoHistorico(reg) {
    const h = [reg, ...lerHistorico()].slice(0, MAX_HISTORICO);
    salvar('historico', h);
    return reg;
  }

  // ---------- candidaturas (mesmas regras do servidor) ----------
  const STATUS = ['enviado', 'analise', 'entrevista', 'teste', 'aprovado', 'reprovado', 'sem_resposta'];
  const CAMPOS = ['cargo', 'empresa', 'canal', 'contato', 'link', 'dataEnvio', 'status', 'proximoContato', 'obs', 'adaptacaoId'];
  function limpar(dados) {
    const c = {};
    for (const k of CAMPOS) if (dados[k] !== undefined) c[k] = String(dados[k] ?? '').slice(0, 2000);
    if (c.status && !STATUS.includes(c.status)) delete c.status;
    return c;
  }

  // ---------- rotas: mesmas URLs que o app usa com o servidor ----------
  window.apiLocal = async function (url, opcoes = {}) {
    const metodo = (opcoes.method || 'GET').toUpperCase();
    const corpo = opcoes.body || {};
    const id = (url.match(/\/(\d+)$/) || [])[1];

    if (url === '/api/estado') {
      const cfg = ler('config', {});
      return { temChave: !!cfg.apiKey, modelo: cfg.modelo || MODELOS_PADRAO[0], curriculo: ler('curriculo', ''), online: true };
    }
    if (url === '/api/config') {
      const cfg = ler('config', {});
      if (corpo.apiKey !== undefined) cfg.apiKey = String(corpo.apiKey).trim();
      if (corpo.modelo) cfg.modelo = String(corpo.modelo).trim();
      salvar('config', cfg);
      return { ok: true };
    }
    if (url === '/api/curriculo') { salvar('curriculo', String(corpo.texto || '')); return { ok: true }; }

    if (url === '/api/vagas') {
      const { imagens = [], textoVaga = '' } = corpo;
      if (!imagens.length && !textoVaga.trim()) throw new Error('Envie a foto/print da vaga ou cole o texto dela.');
      const { resultado } = await gerar(partesComImagens(PROMPT_VAGAS(textoVaga), imagens), ESQUEMA_VAGAS);
      return { vagas: resultado.vagas || [] };
    }
    if (url === '/api/adaptar') {
      const cv = ler('curriculo', '');
      const { imagens = [], textoVaga = '' } = corpo;
      if (!cv.trim()) throw new Error('Cadastre seu currículo primeiro.');
      if (!imagens.length && !textoVaga.trim()) throw new Error('Envie a foto/print da vaga ou cole o texto dela.');
      const { resultado, modelo } = await gerar(partesComImagens(montarPrompt(cv, textoVaga), imagens), ESQUEMA);
      return guardarNoHistorico({
        id: Date.now().toString(), data: new Date().toISOString(), modelo, resultado,
        verificacao: validar(cv, resultado), compatibilidade: compatibilidade(cv, resultado),
      });
    }
    if (url === '/api/montar') {
      const respostas = String(corpo.respostas || '');
      if (respostas.trim().length < 40) throw new Error('Preencha pelo menos seus dados e uma formação ou experiência.');
      const { resultado, modelo } = await gerar([{ text: PROMPT_MONTAR(respostas) }], ESQUEMA_MONTAR);
      const curriculo = resultado.curriculo || {};
      return guardarNoHistorico({
        id: Date.now().toString(), data: new Date().toISOString(), modelo, tipo: 'base', respostas,
        resultado: { vaga: { cargo: 'Currículo montado do zero', texto_transcrito: '' }, curriculo, dicas: resultado.dicas || [], perguntas: resultado.perguntas || [] },
        verificacao: validar(respostas, { vaga: {}, curriculo }),
      });
    }
    if (url === '/api/triagem') {
      const h = lerHistorico();
      const reg = h.find(r => r.id === String(corpo.id));
      if (!reg) throw new Error('Adaptação não encontrada no histórico.');
      if (!String(corpo.textoCv || '').trim()) throw new Error('O currículo está vazio.');
      const { resultado, modelo } = await gerar([{ text: PROMPT_TRIAGEM(reg.resultado?.vaga?.texto_transcrito || '', corpo.textoCv) }], ESQUEMA_TRIAGEM);
      reg.triagem = { ...resultado, modelo, data: new Date().toISOString() };
      salvar('historico', h);
      return reg.triagem;
    }

    if (url === '/api/historico') {
      return lerHistorico().map(r => ({ id: r.id, data: r.data, cargo: r.resultado?.vaga?.cargo, empresa: r.resultado?.vaga?.empresa }));
    }
    if (url.startsWith('/api/historico/')) {
      const h = lerHistorico();
      if (metodo === 'DELETE') { salvar('historico', h.filter(r => r.id !== id)); return { ok: true }; }
      const reg = h.find(r => r.id === id);
      if (!reg) throw new Error('Não encontrado no histórico.');
      return reg;
    }

    if (url === '/api/candidaturas' && metodo === 'GET') return ler('candidaturas', []);
    if (url === '/api/candidaturas' && metodo === 'POST') {
      const c = limpar(corpo);
      if (!c.cargo && !c.empresa) throw new Error('Informe pelo menos o cargo ou a empresa.');
      const nova = {
        id: Date.now().toString(), cargo: '', empresa: '', canal: '', contato: '', link: '', obs: '', adaptacaoId: '', proximoContato: '',
        ...c, dataEnvio: c.dataEnvio || hojeLocal(), status: c.status || 'enviado',
      };
      nova.historico = [{ data: new Date().toISOString(), status: nova.status }];
      salvar('candidaturas', [nova, ...ler('candidaturas', [])]);
      return nova;
    }
    if (url.startsWith('/api/candidaturas/')) {
      const lista = ler('candidaturas', []);
      if (metodo === 'DELETE') { salvar('candidaturas', lista.filter(c => c.id !== id)); return { ok: true }; }
      const c = lista.find(x => x.id === id);
      if (!c) throw new Error('Candidatura não encontrada.');
      const m = limpar(corpo);
      if (m.status && m.status !== c.status) c.historico = [...(c.historico || []), { data: new Date().toISOString(), status: m.status }];
      Object.assign(c, m, { atualizado: new Date().toISOString() });
      salvar('candidaturas', lista);
      return c;
    }
    throw new Error('Função indisponível na versão online.');
  };
})();
