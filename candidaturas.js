// Controle de candidaturas: onde enviei, em que pé está e quando cobrar retorno.
const SITUACOES = {
  enviado: { nome: 'Enviado', cor: 'azul' },
  analise: { nome: 'Em análise', cor: 'azul' },
  entrevista: { nome: 'Entrevista', cor: 'roxo' },
  teste: { nome: 'Teste / prova', cor: 'roxo' },
  aprovado: { nome: 'Aprovado 🎉', cor: 'verde' },
  reprovado: { nome: 'Não passou', cor: 'cinza' },
  sem_resposta: { nome: 'Sem resposta', cor: 'cinza' },
};
const EM_ABERTO = ['enviado', 'analise', 'entrevista', 'teste'];
const DIAS_PARA_COBRAR = 7;

let candidaturas = [];
let filtro = '';
let editando = null;

// Datas sempre no fuso do computador (toISOString usaria UTC e "viraria o dia" às 21h no Brasil)
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeISO = () => isoLocal(new Date());
const somarDias = (iso, dias) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + dias); return isoLocal(d); };
const dataBR = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const diasDesde = iso => Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(iso.slice(0, 10) + 'T12:00:00')) / 86400000);
const precisaCobrar = c => EM_ABERTO.includes(c.status) && c.proximoContato && c.proximoContato <= hojeISO();

// ---------- Abas do app ----------
document.querySelectorAll('.aba-app').forEach(b => b.onclick = () => mostrarView(b.dataset.view));
function mostrarView(id) {
  document.querySelectorAll('.aba-app').forEach(b => b.classList.toggle('ativa', b.dataset.view === id));
  $('viewAdaptar').hidden = id !== 'viewAdaptar';
  $('viewCandidaturas').hidden = id !== 'viewCandidaturas';
  if (id === 'viewCandidaturas') desenharCandidaturas();
}

// ---------- Dados ----------
async function carregarCandidaturas() {
  candidaturas = await api('/api/candidaturas');
  const n = candidaturas.filter(precisaCobrar).length;
  $('badgeCobrar').hidden = !n;
  $('badgeCobrar').textContent = n;
  if (!$('viewCandidaturas').hidden) desenharCandidaturas();
}

async function salvarCampo(id, dados) {
  await api('/api/candidaturas/' + id, { method: 'PUT', body: dados });
  await carregarCandidaturas();
}

// ---------- Lista ----------
function desenharCandidaturas() {
  // contadores por situação (clicar filtra)
  const cont = {};
  candidaturas.forEach(c => { cont[c.status] = (cont[c.status] || 0) + 1; });
  $('contadores').innerHTML = `<button class="contador ${filtro === '' ? 'ativo' : ''}" data-f="">Todas <b>${candidaturas.length}</b></button>`
    + Object.entries(SITUACOES).filter(([k]) => cont[k]).map(([k, s]) =>
      `<button class="contador ${s.cor} ${filtro === k ? 'ativo' : ''}" data-f="${k}">${s.nome} <b>${cont[k]}</b></button>`).join('');
  $('contadores').querySelectorAll('.contador').forEach(b => b.onclick = () => { filtro = b.dataset.f; desenharCandidaturas(); });

  const cobrar = candidaturas.filter(precisaCobrar);
  $('avisoCobrar').innerHTML = cobrar.length
    ? `<div class="aviso atencao">⏰ <b>${cobrar.length} candidatura(s) esperando retorno há um tempo.</b> Uma mensagem educada perguntando sobre o processo mostra interesse e costuma ajudar. Use o botão "Mensagem de cobrança".</div>`
    : '';

  const lista = candidaturas
    .filter(c => !filtro || c.status === filtro)
    .sort((a, b) => (precisaCobrar(b) - precisaCobrar(a))
      || (EM_ABERTO.includes(b.status) - EM_ABERTO.includes(a.status))
      || (b.dataEnvio || '').localeCompare(a.dataEnvio || ''));

  if (!candidaturas.length) {
    $('listaCand').innerHTML = `<div class="vazio-grande"><p>Nenhuma candidatura ainda.<br><small>Depois de adaptar um currículo, clique em "📨 Marquei como enviada", ou use "+ Nova candidatura".</small></p></div>`;
    return;
  }
  $('listaCand').innerHTML = lista.map(cartaoCandidatura).join('') || '<p class="vazio">Nenhuma candidatura nessa situação.</p>';

  $('listaCand').querySelectorAll('[data-acao]').forEach(el => {
    const c = candidaturas.find(x => x.id === el.closest('.cand').dataset.id);
    const acao = el.dataset.acao;
    if (acao === 'status') el.onchange = () => {
      const dados = { status: el.value };
      // avançou de etapa: lembra de cobrar de novo em 7 dias; terminou: não precisa mais lembrar
      dados.proximoContato = EM_ABERTO.includes(el.value) ? somarDias(hojeISO(), DIAS_PARA_COBRAR) : '';
      salvarCampo(c.id, dados);
    };
    else el.onclick = () => ({
      cobrar: () => mostrarMensagem(c, el),
      adiar: () => salvarCampo(c.id, { proximoContato: somarDias(hojeISO(), DIAS_PARA_COBRAR) }),
      editar: () => abrirForm(c),
      curriculo: () => abrirCurriculo(c.adaptacaoId),
      apagar: async () => {
        if (!confirm(`Apagar a candidatura "${c.cargo || c.empresa}"?`)) return;
        await api('/api/candidaturas/' + c.id, { method: 'DELETE' });
        carregarCandidaturas();
      },
    })[acao]?.();
  });
}

function cartaoCandidatura(c) {
  const s = SITUACOES[c.status] || SITUACOES.enviado;
  const dias = c.dataEnvio ? diasDesde(c.dataEnvio) : null;
  const linhaTempo = (c.historico || []).map(h => `${SITUACOES[h.status]?.nome || h.status} ${dataBR(h.data)}`).join(' → ');
  const aberto = EM_ABERTO.includes(c.status);
  return `
  <article class="cand cartao ${aberto ? '' : 'encerrada'} ${precisaCobrar(c) ? 'cobrar' : ''}" data-id="${c.id}">
    <div class="cand-cabeca">
      <div>
        <h3>${esc(c.cargo || 'Vaga sem cargo')}${c.empresa ? ` <span>· ${esc(c.empresa)}</span>` : ''}</h3>
        <p class="cand-meta">
          ${c.canal ? esc(c.canal) + ' · ' : ''}enviado em ${dataBR(c.dataEnvio)}${dias !== null ? ` (${dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`})` : ''}
          ${c.contato ? ` · contato: ${esc(c.contato)}` : ''}
          ${c.link ? ` · <a href="${esc(/^https?:\/\//.test(c.link) ? c.link : 'https://' + c.link)}" target="_blank" rel="noopener">ver vaga</a>` : ''}
        </p>
      </div>
      <select class="sel-status ${s.cor}" data-acao="status">
        ${Object.entries(SITUACOES).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v.nome}</option>`).join('')}
      </select>
    </div>
    ${precisaCobrar(c) ? `<p class="cand-alerta">⏰ Hora de cobrar um retorno</p>`
      : aberto && c.proximoContato ? `<p class="cand-lembrete">Lembrete para cobrar em ${dataBR(c.proximoContato)}</p>` : ''}
    ${c.obs ? `<p class="cand-obs">${esc(c.obs)}</p>` : ''}
    ${linhaTempo ? `<p class="cand-tempo">${linhaTempo}</p>` : ''}
    <div class="cand-acoes">
      ${aberto ? `<button class="link" data-acao="cobrar">💬 Mensagem de cobrança</button>` : ''}
      ${precisaCobrar(c) ? `<button class="link" data-acao="adiar">Já cobrei, lembrar em 7 dias</button>` : ''}
      ${c.adaptacaoId ? `<button class="link" data-acao="curriculo">📄 Ver currículo enviado</button>` : ''}
      <button class="link" data-acao="editar">Editar</button>
      <button class="link perigo" data-acao="apagar">Apagar</button>
    </div>
    <div class="cand-msg" hidden></div>
  </article>`;
}

// ---------- Mensagem de cobrança (modelo pronto, sem IA) ----------
function meuNome() {
  const primeira = ($('textoCv').value || '').split('\n').find(l => l.trim()) || '';
  return primeira.trim().toLowerCase().split(/\s+/).slice(0, 2)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function mensagemCobranca(c) {
  const vaga = `a vaga de ${c.cargo || 'emprego'}${c.empresa ? ` na empresa ${c.empresa}` : ''}`;
  const nome = meuNome();
  if (c.status === 'entrevista' || c.status === 'teste') {
    const etapa = c.status === 'entrevista' ? 'da entrevista' : 'da etapa de teste';
    return `Olá, tudo bem? Aqui é ${nome || '(seu nome)'}. Participei ${etapa} para ${vaga} e gostaria de saber se já existe um retorno sobre o processo. Agradeço pela oportunidade e continuo à disposição!`;
  }
  return `Olá, tudo bem? Me chamo ${nome || '(seu nome)'} e me candidatei para ${vaga} no dia ${dataBR(c.dataEnvio)}. Gostaria de saber se há alguma novidade sobre o processo seletivo. Continuo muito interessado e à disposição. Obrigado!`;
}

function mostrarMensagem(c, botao) {
  const box = botao.closest('.cand').querySelector('.cand-msg');
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<textarea rows="4">${esc(mensagemCobranca(c))}</textarea>
    <div class="barra"><button class="btn">Copiar mensagem</button><span class="ajuda">Ajuste o texto se quiser antes de copiar.</span></div>`;
  box.querySelector('button').onclick = async () => {
    const texto = box.querySelector('textarea').value;
    try { await navigator.clipboard.writeText(texto); } catch { box.querySelector('textarea').select(); document.execCommand('copy'); }
    box.querySelector('button').textContent = '✔ Copiada';
  };
}

async function abrirCurriculo(id) {
  try {
    const reg = await api('/api/historico/' + id);
    mostrarView('viewAdaptar');
    exibir(reg);
  } catch { alert('Esse currículo não está mais no histórico.'); }
}

// ---------- Formulário ----------
const form = $('formCand');
form.elements.status.innerHTML = Object.entries(SITUACOES).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('');

function abrirForm(c = null, prefill = {}) {
  editando = c;
  $('formCandTitulo').textContent = c ? 'Editar candidatura' : 'Nova candidatura';
  const dados = c || { dataEnvio: hojeISO(), status: 'enviado', proximoContato: somarDias(hojeISO(), DIAS_PARA_COBRAR), canal: 'Gupy', ...prefill };
  for (const el of form.elements) if (el.name) el.value = dados[el.name] ?? '';
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.cargo.focus();
}

$('novaCand').onclick = () => abrirForm();
$('cancelarCand').onclick = () => { form.hidden = true; };
form.onsubmit = async ev => {
  ev.preventDefault();
  const dados = Object.fromEntries(new FormData(form));
  try {
    if (editando) await api('/api/candidaturas/' + editando.id, { method: 'PUT', body: dados });
    else await api('/api/candidaturas', { method: 'POST', body: dados });
    form.hidden = true;
    await carregarCandidaturas();
  } catch (e) { alert(e.message); }
};

// ---------- "Marquei como enviada" (a partir de uma adaptação) ----------
$('marcarEnviada').onclick = () => {
  if (!atual) return;
  $('envioBox').hidden = !$('envioBox').hidden;
  if (!$('envioBox').hidden) $('envioBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('envioSalvar').onclick = async () => {
  const v = atual.resultado.vaga || {};
  try {
    await api('/api/candidaturas', {
      method: 'POST',
      body: {
        cargo: v.cargo || '', empresa: v.empresa || '', canal: $('envioCanal').value, contato: $('envioContato').value,
        adaptacaoId: atual.id, dataEnvio: hojeISO(), status: 'enviado', proximoContato: somarDias(hojeISO(), DIAS_PARA_COBRAR),
      },
    });
    $('envioSalvar').disabled = true;
    $('envioSalvar').textContent = '✔ Adicionada às candidaturas';
    $('envioOk').hidden = false;
    carregarCandidaturas();
  } catch (e) { alert(e.message); }
};
$('irCand').onclick = () => mostrarView('viewCandidaturas');

// Ao abrir outra adaptação, a caixa de envio volta ao estado inicial.
const exibirSemEnvio = exibir;
exibir = reg => {
  exibirSemEnvio(reg);
  $('envioBox').hidden = true;
  $('envioSalvar').disabled = false;
  $('envioSalvar').textContent = 'Adicionar às candidaturas';
  $('envioOk').hidden = true;
  $('envioContato').value = '';
};

carregarCandidaturas().catch(() => {});
