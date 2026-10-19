const $ = id => document.getElementById(id);
let imagens = [];          // [{mime, data, url}]
let atual = null;          // registro exibido

// Com o servidor do PC (iniciar.bat) usa a API dele; sem servidor (versão online) tudo roda no navegador.
let semServidorCache = null;
async function semServidor() {
  if (semServidorCache === null) {
    try {
      const r = await fetch('/api/estado', { cache: 'no-store' });
      semServidorCache = !(r.ok && (r.headers.get('content-type') || '').includes('json'));
    } catch { semServidorCache = true; }
  }
  return semServidorCache;
}

const api = async (url, opcoes = {}) => {
  if (await semServidor()) return apiLocal(url, opcoes);
  const r = await fetch(url, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json' },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || 'Erro inesperado');
  return j;
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@]+/g, '');

// ---------- Estado inicial ----------
async function iniciar() {
  const e = await api('/api/estado');
  if (e.online) document.body.classList.add('modo-online');
  mostrarChave(e.temChave);
  $('textoCv').value = e.curriculo || '';
  carregarHistorico();
}

function mostrarChave(tem) {
  $('chaveOk').hidden = !tem;
  $('chaveForm').hidden = tem;
}

$('salvarChave').onclick = async () => {
  const chave = $('apiKey').value.trim();
  if (!chave) return alert('Cole a chave primeiro.');
  await api('/api/config', { method: 'POST', body: { apiKey: chave } });
  $('apiKey').value = '';
  mostrarChave(true);
};
$('trocarChave').onclick = () => mostrarChave(false);

// ---------- Currículo ----------
$('arquivoCv').onchange = async ev => {
  const arq = ev.target.files[0];
  if (!arq) return;
  $('cvStatus').textContent = 'Lendo arquivo…';
  try {
    let texto;
    if (/\.pdf$/i.test(arq.name)) texto = await lerPdf(arq);
    else if (/\.docx$/i.test(arq.name)) texto = (await mammoth.extractRawText({ arrayBuffer: await arq.arrayBuffer() })).value;
    else texto = await arq.text();
    $('textoCv').value = texto.replace(/\n{3,}/g, '\n\n').trim();
    $('cvStatus').textContent = 'Texto extraído — confira e clique em Salvar.';
  } catch (e) {
    $('cvStatus').textContent = '';
    alert('Não consegui ler o arquivo: ' + e.message + '\nTente copiar e colar o texto.');
  }
  ev.target.value = '';
};

async function lerPdf(arq) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await arq.arrayBuffer() }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pag = await (await pdf.getPage(i)).getTextContent();
    for (const item of pag.items) texto += item.str + (item.hasEOL ? '\n' : '');
    texto += '\n\n';
  }
  if (!texto.trim()) throw new Error('o PDF parece ser uma imagem escaneada, sem texto');
  return texto;
}

$('salvarCv').onclick = async () => {
  await api('/api/curriculo', { method: 'POST', body: { texto: $('textoCv').value } });
  $('cvStatus').textContent = '✔ Currículo salvo';
};

// ---------- Imagens da vaga ----------
const zona = $('zona');
zona.onclick = () => $('arquivoVaga').click();
zona.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') $('arquivoVaga').click(); };
$('arquivoVaga').onchange = e => { adicionarImagens(e.target.files); e.target.value = ''; };
zona.ondragover = e => { e.preventDefault(); zona.classList.add('arrastando'); };
zona.ondragleave = () => zona.classList.remove('arrastando');
zona.ondrop = e => { e.preventDefault(); zona.classList.remove('arrastando'); adicionarImagens(e.dataTransfer.files); };
document.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('textarea, input, [contenteditable]')) return;
  const arqs = [...e.clipboardData.items].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
  if (arqs.length) adicionarImagens(arqs);
});

// Reduz fotos grandes de celular para envio mais rápido, mantendo o texto legível.
function prepararImagem(arq) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const max = 2200;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.9);
      ok({ mime: 'image/jpeg', data: url.split(',')[1], url });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => falha(new Error('imagem inválida'));
    img.src = URL.createObjectURL(arq);
  });
}

async function adicionarImagens(lista) {
  for (const arq of lista) {
    if (!arq.type.startsWith('image/')) continue;
    try { imagens.push(await prepararImagem(arq)); } catch { alert('Não consegui abrir ' + arq.name); }
  }
  desenharMiniaturas();
}

function desenharMiniaturas() {
  $('miniaturas').innerHTML = imagens.map((im, i) =>
    `<div><img src="${im.url}" alt="Vaga ${i + 1}"><button title="Remover" data-i="${i}">×</button></div>`).join('');
  $('miniaturas').querySelectorAll('button').forEach(b => b.onclick = () => {
    imagens.splice(+b.dataset.i, 1);
    desenharMiniaturas();
  });
}

// ---------- Adaptar ----------
function ocupado(sim, msg = '') {
  $('adaptar').disabled = sim;
  $('carregando').hidden = !sim;
  if (sim) {
    $('msgCarregando').textContent = msg;
    $('placeholder').hidden = true;
    $('saida').hidden = true;
    $('escolha').hidden = true;
  }
}

// 1ª etapa: descobre quantas vagas tem no anúncio. Uma só → adapta direto; várias → deixa escolher.
$('adaptar').onclick = async () => {
  if (!$('textoCv').value.trim()) return alert('Cadastre seu currículo no passo 2.');
  if (!imagens.length && !$('textoVaga').value.trim()) return alert('Envie a foto da vaga ou cole o texto dela.');
  ocupado(true, 'Lendo o anúncio e procurando as vagas…');
  let vagas;
  try {
    ({ vagas } = await api('/api/vagas', {
      method: 'POST',
      body: { imagens: imagens.map(({ mime, data }) => ({ mime, data })), textoVaga: $('textoVaga').value },
    }));
    if (!vagas.length) throw new Error('Não encontrei nenhuma vaga na imagem/texto. Tente uma foto mais nítida.');
  } catch (e) {
    ocupado(false);
    $('placeholder').hidden = false;
    return alert(e.message);
  }
  ocupado(false);
  if (vagas.length === 1) adaptarVagas(vagas);
  else mostrarEscolha(vagas);
};

function mostrarEscolha(vagas) {
  $('placeholder').hidden = true;
  $('saida').hidden = true;
  $('escolha').hidden = false;
  $('escolhaTitulo').textContent = `Encontrei ${vagas.length} vagas neste anúncio. Para qual(is) você quer o currículo?`;
  $('listaVagas').innerHTML = vagas.map((v, i) => `
    <label class="opcao-vaga">
      <input type="checkbox" value="${i}">
      <span><b>${esc(v.cargo)}</b>${v.empresa ? ` <small>— ${esc(v.empresa)}</small>` : ''}
        ${v.resumo ? `<br><small>${esc(v.resumo)}</small>` : ''}</span>
    </label>`).join('');
  $('todasVagas').onclick = () => $('listaVagas').querySelectorAll('input').forEach(c => { c.checked = true; });
  $('adaptarEscolhidas').onclick = () => {
    const escolhidas = [...$('listaVagas').querySelectorAll('input:checked')].map(c => vagas[+c.value]);
    if (!escolhidas.length) return alert('Marque pelo menos uma vaga.');
    adaptarVagas(escolhidas, vagas.length > 1);
  };
}

const textoDaVaga = (v, variasNoAnuncio) => (variasNoAnuncio
  ? `ATENÇÃO: este anúncio oferece várias vagas. Adapte o currículo SOMENTE para a vaga "${v.cargo}".\n\n`
  : '') + v.texto_completo;

// 2ª etapa: um currículo adaptado para cada vaga escolhida (uma de cada vez, por causa do limite gratuito).
async function adaptarVagas(lista, variasNoAnuncio = false) {
  const gerados = [];
  try {
    // Garante que a versão do currículo na tela é a que será usada.
    await api('/api/curriculo', { method: 'POST', body: { texto: $('textoCv').value } });
    for (const [i, v] of lista.entries()) {
      ocupado(true, lista.length > 1
        ? `Adaptando para “${v.cargo}” (${i + 1} de ${lista.length})…`
        : 'Adaptando seu currículo para a vaga…');
      gerados.push(await api('/api/adaptar', { method: 'POST', body: { imagens: [], textoVaga: textoDaVaga(v, variasNoAnuncio) } }));
    }
  } catch (e) {
    alert(e.message + (gerados.length ? `\n\n${gerados.length} currículo(s) foram gerados antes do erro.` : ''));
  } finally {
    ocupado(false);
  }
  geradosAgora = gerados;
  if (gerados.length) exibir(gerados[0]);
  else $('placeholder').hidden = false;
  carregarHistorico();
}

// Abas para alternar entre os currículos gerados para várias vagas do mesmo anúncio.
let geradosAgora = [];
function desenharAbas() {
  const naLista = geradosAgora.some(g => g.id === atual.id);
  $('abas').hidden = !(naLista && geradosAgora.length > 1);
  if ($('abas').hidden) return;
  $('abas').innerHTML = geradosAgora.map(g => `
    <button class="aba ${g.id === atual.id ? 'ativa' : ''}" data-id="${g.id}">
      ${esc(g.resultado.vaga?.cargo || 'Vaga')} <small>${g.compatibilidade ? g.compatibilidade.depois + '%' : ''}</small>
    </button>`).join('');
  $('abas').querySelectorAll('button').forEach(b => b.onclick = () => exibir(geradosAgora.find(g => g.id === b.dataset.id)));
}

// ---------- Exibição ----------
function exibir(reg) {
  atual = reg;
  const { resultado, verificacao } = reg;
  $('placeholder').hidden = true;
  $('escolha').hidden = true;
  $('saida').hidden = false;
  desenharAbas();
  desenharVerificacao(verificacao);
  desenharAnalise(reg);
  desenharTriagem(reg.triagem);
  $('cv').innerHTML = montarCv(resultado.curriculo || {}, new Set((verificacao.termosSuspeitos || []).map(norm)));
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function desenharVerificacao(v) {
  const alertas = v.alertas || [];
  if (!alertas.length) {
    $('verificacao').innerHTML = `<div class="aviso ok">✔ <b>Verificação concluída:</b> tudo o que está no currículo adaptado foi encontrado no seu currículo original.</div>`;
    return;
  }
  const altos = alertas.filter(a => a.gravidade === 'alta').length;
  $('verificacao').innerHTML = `
    <div class="aviso ${altos ? 'erro' : 'atencao'}">
      <b>${altos ? '⚠ Confira antes de enviar:' : 'Pontos para conferir:'}</b>
      a verificação automática encontrou ${alertas.length} trecho(s) que não batem exatamente com seu currículo original
      (destacados em amarelo). Pode ser só uma reescrita, mas confira — edite ou apague se não for verdade.
      <ul>${alertas.map(a => `<li><span class="grav">${a.gravidade === 'alta' ? 'Importante' : 'Atenção'}</span> · ${esc(a.onde)} — ${esc(a.motivo)}<br><em>“${esc(a.texto)}”</em></li>`).join('')}</ul>
    </div>`;
}

function desenharAnalise(reg) {
  // Currículo montado do zero não tem vaga: mostra dicas e o botão de usar como base
  const base = reg.tipo === 'base';
  $('triar').hidden = base;
  $('marcarEnviada').hidden = base;
  if (base) return desenharBase(reg);
  const r = reg.resultado;
  const a = r.analise || {};
  const v = r.vaga || {};
  const k = reg.compatibilidade;
  const nota = Math.max(0, Math.min(100, a.compatibilidade || 0));
  const lista = (itens, f) => itens?.length ? `<ul>${itens.map(f).join('')}</ul>` : '<p class="vazio">—</p>';
  const botaoTenho = texto => `<button class="tenho" data-req="${esc(texto)}">Eu tenho isso</button>`;

  const blocoChaves = k ? `
    <div class="placar">
      <div><small>Seu currículo original</small><b class="antes">${k.antes}%</b></div>
      <span class="seta">→</span>
      <div><small>Currículo adaptado</small><b class="depois">${k.depois}%</b></div>
    </div>
    <p class="ajuda">Porcentagem das ${k.total} palavras-chave da vaga que aparecem no currículo — é assim que os sistemas de RH fazem a primeira triagem.</p>
    <div class="chips">
      ${k.encontradas.map(c => `<span class="chip sim">✔ ${esc(c)}</span>`).join('')}
      ${k.faltando.map(c => `<span class="chip nao">${esc(c)} ${botaoTenho(c)}</span>`).join('')}
    </div>` : '';

  $('analise').innerHTML = `
    <h3>Vaga: ${esc(v.cargo || 'não identificada')}${v.empresa ? ' — ' + esc(v.empresa) : ''}</h3>
    ${blocoChaves}
    <div class="medidor"><span>Aderência real (avaliação da IA)</span><div class="trilho"><div class="barra-nota" style="width:${nota}%"></div></div><b>${nota}%</b></div>
    <h3>✔ Requisitos que você atende</h3>
    ${lista(a.requisitos_atendidos, x => `<li>${esc(x.requisito)}<br><span class="evid">no seu currículo: “${esc(x.evidencia)}”</span></li>`)}
    <h3>✘ Requisitos que não estão no seu currículo</h3>
    <p class="ajuda">Se você tem algum deles e só não tinha colocado no currículo, clique em “Eu tenho isso”: a informação entra no seu currículo base e a compatibilidade sobe na próxima adaptação.</p>
    ${lista(a.requisitos_nao_atendidos, x => `<li>${esc(x)} ${botaoTenho(x)}</li>`)}
    <div id="confirmacao" class="confirmacao" hidden>
      <b id="confReq"></b>
      <p class="ajuda">Conte com suas palavras onde e como você tem isso (ex.: “no estágio da UNINTA eu criava usuários no Active Directory”). Só coloque o que for verdade — isso vai para o currículo.</p>
      <textarea id="confTexto" rows="3"></textarea>
      <button id="confSalvar" class="btn">Adicionar ao meu currículo</button>
      <button id="confCancelar" class="link">cancelar</button>
    </div>
    <div id="readaptarBox" class="readaptar" hidden>
      <span id="readaptarInfo"></span>
      <button id="readaptar" class="btn">Readaptar com as novas informações</button>
    </div>
    <h3>💡 Dicas</h3>
    ${lista(a.dicas, x => `<li>${esc(x)}</li>`)}`;

  $('analise').querySelectorAll('.tenho').forEach(b => b.onclick = () => abrirConfirmacao(b.dataset.req));
  $('confCancelar').onclick = () => { $('confirmacao').hidden = true; };
  $('confSalvar').onclick = salvarConfirmacao;
  $('readaptar').onclick = () => adaptarVagas([{
    cargo: atual.resultado.vaga?.cargo || '',
    texto_completo: atual.resultado.vaga?.texto_transcrito || '',
  }], true);
  adicionadas = 0;
}

// ---------- "Eu tenho isso": completa o currículo base com informações verdadeiras ----------
const TITULO_CONFIRMADAS = 'INFORMAÇÕES CONFIRMADAS PELO CANDIDATO';
let reqAtual = '';
let adicionadas = 0;

function abrirConfirmacao(req) {
  reqAtual = req;
  $('confReq').textContent = req;
  $('confTexto').value = '';
  $('confirmacao').hidden = false;
  $('confTexto').focus();
}

async function salvarConfirmacao() {
  const desc = $('confTexto').value.trim();
  if (!desc) return alert('Descreva onde/como você tem isso.');
  let cv = $('textoCv').value.trimEnd();
  if (!cv.includes(TITULO_CONFIRMADAS)) cv += `\n\n${TITULO_CONFIRMADAS}`;
  cv += `\n- ${reqAtual}: ${desc}`;
  $('textoCv').value = cv;
  await api('/api/curriculo', { method: 'POST', body: { texto: cv } });
  $('confirmacao').hidden = true;
  $('analise').querySelectorAll('.tenho').forEach(b => {
    if (b.dataset.req === reqAtual) { b.disabled = true; b.textContent = '✔ adicionado'; }
  });
  adicionadas++;
  $('readaptarInfo').textContent = `${adicionadas} informação(ões) adicionada(s) ao seu currículo base.`;
  $('readaptarBox').hidden = false;
}

// Escapa o texto e marca as palavras suspeitas apontadas pela verificação.
function marcar(texto, suspeitos) {
  if (!suspeitos.size) return esc(texto);
  return String(texto ?? '').split(/([\p{L}\p{N}]+)/u)
    .map(p => suspeitos.has(norm(p)) && norm(p) ? `<mark class="suspeito">${esc(p)}</mark>` : esc(p)).join('');
}

function montarCv(c, s) {
  const m = t => marcar(t, s);
  const secao = (titulo, corpo) => corpo ? `<h2>${titulo}</h2>${corpo}` : '';
  const ul = itens => itens?.length ? `<ul>${itens.map(i => `<li>${m(i)}</li>`).join('')}</ul>` : '';

  const exps = (c.experiencias || []).map(e => `
    <div class="exp">
      <div class="exp-topo"><strong>${m(e.cargo)}</strong><span class="periodo">${m(e.periodo)}</span></div>
      <div class="empresa">${m(e.empresa)}${e.local ? ' · ' + m(e.local) : ''}</div>
      ${ul((e.itens || []).map(i => i.texto))}
    </div>`).join('');

  const forms = (c.formacao || []).map(f => `
    <div class="exp">
      <div class="exp-topo"><strong>${m(f.curso)}</strong><span class="periodo">${m(f.periodo)}</span></div>
      ${f.instituicao ? `<div class="empresa">${m(f.instituicao)}</div>` : ''}
    </div>`).join('');

  return `
    <h1>${m(nomeBonito(c.nome))}</h1>
    ${c.objetivo ? `<div class="objetivo">${esc(c.objetivo)}</div>` : ''}
    <div class="contatos">${(c.contatos || []).map(m).join(' &nbsp;·&nbsp; ')}</div>
    ${secao('Resumo profissional', c.resumo ? `<p>${m(c.resumo)}</p>` : '')}
    ${secao('Experiência profissional', exps)}
    ${secao('Competências', c.competencias?.length ? `<p class="tags">${c.competencias.map(m).join(' • ')}</p>` : '')}
    ${secao('Formação', forms)}
    ${secao('Cursos e certificações', ul(c.cursos))}
    ${secao('Idiomas', ul(c.idiomas))}
    ${(c.outros || []).map(o => secao(esc(o.titulo), ul(o.itens))).join('')}`;
}

// ---------- Simulador de triagem ----------
const DECISOES = {
  avanca: { classe: 'ok', texto: '✔ Avança para o recrutador' },
  talvez: { classe: 'atencao', texto: '≈ Talvez avance' },
  reprovado: { classe: 'erro', texto: '✘ Seria reprovado na triagem' },
};

function desenharTriagem(t) {
  const box = $('triagem');
  if (!t) { box.hidden = true; box.innerHTML = ''; return; }
  const d = DECISOES[t.decisao] || DECISOES.talvez;
  const lista = (titulo, itens) => itens?.length ? `<h3>${titulo}</h3><ul>${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  box.hidden = false;
  box.innerHTML = `
    <div class="triagem-topo">
      <div><h3>🤖 Simulação da triagem automática</h3>
        <p class="ajuda">Uma segunda IA avaliou o currículo como o filtro de uma plataforma de recrutamento faria.</p></div>
      <div class="decisao ${d.classe}"><b>${Math.max(0, Math.min(100, t.nota || 0))}</b><span>${d.texto}</span></div>
    </div>
    <p>${esc(t.resumo)}</p>
    ${lista('👍 Pesa a favor', t.pontos_fortes)}
    ${lista('👎 Pesa contra', t.pontos_fracos)}
    ${lista('Requisitos que o currículo não comprova', t.requisitos_nao_comprovados)}
    ${t.palavras_ausentes?.length ? `<h3>Palavras-chave da vaga que faltam</h3><div class="chips">${t.palavras_ausentes.map(p => `<span class="chip nao">${esc(p)}</span>`).join('')}</div>` : ''}
    ${lista('💡 Como melhorar (sem inventar)', t.sugestoes)}
    ${t.perguntas?.length ? `<h3>🎤 Perguntas prováveis na entrevista</h3>
      ${t.perguntas.map(p => `<details class="pergunta"><summary>${esc(p.pergunta)}</summary><p>${esc(p.dica)}</p></details>`).join('')}` : ''}
    <p class="ajuda">Simulação feita por IA: serve de treino, não é garantia do resultado real. Se você editar o currículo, simule de novo.</p>`;
}

$('triar').onclick = async () => {
  if (!atual) return;
  const botao = $('triar');
  botao.disabled = true;
  botao.textContent = '🤖 Avaliando…';
  try {
    // Usa o texto que está na tela, para considerar as edições feitas à mão.
    atual.triagem = await api('/api/triagem', { method: 'POST', body: { id: atual.id, textoCv: $('cv').innerText } });
    desenharTriagem(atual.triagem);
    $('triagem').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert(e.message);
  } finally {
    botao.disabled = false;
    botao.textContent = '🤖 Simular triagem por IA';
  }
};

// "MARIA DA SILVA SANTOS" -> "Maria da Silva Santos" (o layout tradicional volta para maiúsculas via CSS)
function nomeBonito(nome) {
  const n = String(nome || '').trim();
  if (!n || n !== n.toUpperCase()) return n;
  return n.toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

// ---------- Layout do currículo (Clássico, Minimalista ou Tradicional) ----------
const LAYOUTS = ['a', 'b', 'c'];
let layoutAtual = 'a';
try { if (LAYOUTS.includes(localStorage.getItem('layoutCv'))) layoutAtual = localStorage.getItem('layoutCv'); } catch {}
function aplicarLayout(l) {
  layoutAtual = l;
  LAYOUTS.forEach(x => $('cv').classList.toggle('layout-' + x, x === l));
  $('layoutCv').value = l;
  try { localStorage.setItem('layoutCv', l); } catch {}
}
$('layoutCv').onchange = e => aplicarLayout(e.target.value);
aplicarLayout(layoutAtual);

$('mostrarMarcas').onchange = e => $('cv').classList.toggle('com-marcas', e.target.checked);

// ---------- Exportar ----------
function nomeArquivo() {
  const nome = atual?.resultado?.curriculo?.nome || 'curriculo';
  const cargo = atual?.resultado?.vaga?.cargo || 'vaga';
  return `Curriculo - ${nome} - ${cargo}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120);
}

function imprimir() {
  const tituloAntigo = document.title;
  document.title = nomeArquivo(); // vira o nome sugerido do PDF
  window.print();
  document.title = tituloAntigo;
}

// Baixa o PDF pronto, gerado no servidor. Se não der, cai na janela de impressão do navegador.
$('baixarPdf').onclick = async () => {
  // Versão online: o próprio navegador gera o PDF ("Salvar como PDF" na tela de impressão/compartilhar)
  if (await semServidor()) return imprimir();
  const botao = $('baixarPdf');
  const copia = $('cv').cloneNode(true);
  copia.querySelectorAll('mark').forEach(mk => mk.replaceWith(...mk.childNodes));
  botao.disabled = true;
  botao.textContent = 'Gerando PDF…';
  try {
    const r = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: copia.innerHTML, titulo: nomeArquivo(), layout: layoutAtual }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'falhou');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = nomeArquivo() + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    imprimir();
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar PDF';
  }
};

$('baixarWord').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(gerarDocx($('cv'), layoutAtual));
  a.download = nomeArquivo() + '.docx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------- Histórico ----------
async function carregarHistorico() {
  const itens = await api('/api/historico');
  const ul = $('historico');
  if (!itens.length) { ul.innerHTML = '<li class="vazio">Nenhuma adaptação ainda.</li>'; return; }
  ul.innerHTML = itens.map(i => `
    <li>
      <button class="abrir" data-id="${i.id}">${esc(i.cargo || 'Vaga')}${i.empresa ? ' — ' + esc(i.empresa) : ''}
        <small>${new Date(i.data).toLocaleString('pt-BR')}</small></button>
      <button class="apagar" data-id="${i.id}" title="Apagar">🗑</button>
    </li>`).join('');
  ul.querySelectorAll('.abrir').forEach(b => b.onclick = async () => exibir(await api('/api/historico/' + b.dataset.id)));
  ul.querySelectorAll('.apagar').forEach(b => b.onclick = async () => {
    if (!confirm('Apagar esta adaptação do histórico?')) return;
    await api('/api/historico/' + b.dataset.id, { method: 'DELETE' });
    carregarHistorico();
  });
}

iniciar().catch(e => alert('Erro ao iniciar: ' + e.message));
