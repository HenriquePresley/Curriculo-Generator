// Montar currículo do zero: passo a passo guiado; a IA transforma as respostas num currículo profissional.
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COMPORTAMENTAIS = ['Responsabilidade', 'Pontualidade', 'Trabalho em equipe', 'Boa comunicação', 'Vontade de aprender',
  'Organização', 'Proatividade', 'Atendimento ao público', 'Resolução de problemas', 'Trabalho sob pressão',
  'Liderança', 'Criatividade'];
const NIVEIS = ['Básico', 'Intermediário', 'Avançado', 'Fluente', 'Nativo'];
const SITUACOES_CURSO = ['Concluído', 'Cursando', 'Incompleto', 'Trancado'];
const CNH = ['Não tenho', 'A', 'B', 'AB', 'C', 'D', 'E'];

const vazio = {
  experiencia: () => ({ cargo: '', empresa: '', cidade: '', inicio: '', fim: '', atual: false, atividades: '', resultados: '' }),
  formacao: () => ({ curso: '', instituicao: '', situacao: 'Concluído', inicio: '', fim: '' }),
  curso: () => ({ nome: '', instituicao: '', ano: '', horas: '' }),
  idioma: () => ({ idioma: '', nivel: 'Básico' }),
};
const novoRascunho = () => ({
  pessoal: { nome: '', cidade: '', uf: '', telefone: '', email: '', linkedin: '', area: '', cnh: 'Não tenho', disponibilidade: '' },
  semExperiencia: false, experiencias: [vazio.experiencia()], formacao: [vazio.formacao()], cursos: [],
  ferramentas: '', idiomas: [], comportamentais: [], outraComp: '', projetos: '', voluntariado: '', outras: '',
});

let R = novoRascunho();
let passo = 0;
try { const s = JSON.parse(localStorage.getItem('rascunhoCurriculo')); if (s?.pessoal) R = { ...novoRascunho(), ...s }; } catch {}
const guardar = () => { try { localStorage.setItem('rascunhoCurriculo', JSON.stringify(R)); } catch {} };

// ---------- leitura/escrita por caminho ("experiencias.0.cargo") ----------
const ler = caminho => caminho.split('.').reduce((o, k) => o?.[k], R);
function escrever(caminho, valor) {
  const ks = caminho.split('.');
  const ultimo = ks.pop();
  ks.reduce((o, k) => o[k], R)[ultimo] = valor;
  guardar();
}

// ---------- componentes ----------
const campo = (rotulo, caminho, o = {}) => `
  <label class="m-campo ${o.largo ? 'largo' : ''}">${rotulo}${o.obrig ? ' <i>*</i>' : ''}
    ${o.area
      ? `<textarea data-c="${caminho}" rows="${o.linhas || 3}" placeholder="${esc(o.ph || '')}">${esc(ler(caminho) || '')}</textarea>`
      : `<input data-c="${caminho}" type="${o.tipo || 'text'}" value="${esc(ler(caminho) || '')}" placeholder="${esc(o.ph || '')}">`}
    ${o.dica ? `<small>${o.dica}</small>` : ''}
  </label>`;
const escolha = (rotulo, caminho, opcoes) => `
  <label class="m-campo">${rotulo}
    <select data-c="${caminho}">${opcoes.map(op => `<option ${ler(caminho) === op ? 'selected' : ''}>${op}</option>`).join('')}</select>
  </label>`;
const bloco = (titulo, i, lista, conteudo) => `
  <div class="m-bloco"><div class="m-bloco-topo"><b>${titulo} ${i + 1}</b>
    <button type="button" class="link perigo" data-remover="${lista}.${i}">remover</button></div>
    <div class="m-grade">${conteudo}</div></div>`;

const PASSOS = [
  {
    titulo: 'Seus dados',
    texto: 'Comece pelo básico. Esses dados vão no topo do currículo.',
    html: () => `<div class="m-grade">
      ${campo('Nome completo', 'pessoal.nome', { obrig: true, largo: true })}
      ${campo('Cidade', 'pessoal.cidade', { obrig: true, ph: 'Ex.: Sobral' })}
      ${campo('Estado (UF)', 'pessoal.uf', { ph: 'Ex.: CE' })}
      ${campo('Telefone / WhatsApp', 'pessoal.telefone', { obrig: true, ph: '(88) 9 9999-9999' })}
      ${campo('E-mail', 'pessoal.email', { tipo: 'email', ph: 'seunome@gmail.com', dica: 'Use um e-mail simples, com seu nome.' })}
      ${campo('LinkedIn', 'pessoal.linkedin', { ph: 'opcional' })}
      ${campo('Que tipo de vaga você procura?', 'pessoal.area', { obrig: true, largo: true, ph: 'Ex.: atendimento, vendas, auxiliar administrativo, suporte de TI' })}
      ${escolha('CNH', 'pessoal.cnh', CNH)}
      ${campo('Disponibilidade de horário', 'pessoal.disponibilidade', { ph: 'Ex.: manhã e tarde, escala 6x1' })}
    </div>`,
    validar: () => (!R.pessoal.nome.trim() || !R.pessoal.cidade.trim() || !R.pessoal.telefone.trim() || !R.pessoal.area.trim())
      && 'Preencha nome, cidade, telefone e o tipo de vaga que você procura.',
  },
  {
    titulo: 'Experiência',
    texto: 'Inclua empregos, estágios, jovem aprendiz, bicos e trabalhos por conta própria. Escreva do seu jeito, a IA deixa profissional, mas só usa o que você escrever.',
    html: () => `
      <label class="m-check"><input type="checkbox" data-c="semExperiencia" ${R.semExperiencia ? 'checked' : ''}> Ainda não tive nenhum trabalho</label>
      ${R.semExperiencia ? '<p class="ajuda">Sem problema! Capriche na formação, nos cursos e nos projetos. Para primeiro emprego, eles contam muito.</p>' : `
      ${R.experiencias.map((x, i) => bloco('Experiência', i, 'experiencias', `
        ${campo('Cargo / função', `experiencias.${i}.cargo`, { obrig: true, ph: 'Ex.: Atendente, Auxiliar de loja' })}
        ${campo('Empresa', `experiencias.${i}.empresa`, { obrig: true, ph: 'Ou "Autônomo"' })}
        ${campo('Cidade', `experiencias.${i}.cidade`)}
        ${campo('Começou em', `experiencias.${i}.inicio`, { tipo: 'month' })}
        ${x.atual ? '<div class="m-campo"></div>' : campo('Saiu em', `experiencias.${i}.fim`, { tipo: 'month' })}
        <label class="m-check largo"><input type="checkbox" data-c="experiencias.${i}.atual" ${x.atual ? 'checked' : ''}> Trabalho aqui atualmente</label>
        ${campo('O que você fazia no dia a dia?', `experiencias.${i}.atividades`, { area: true, largo: true, linhas: 4, ph: 'Ex.: atendia clientes no balcão, mexia no caixa, arrumava as prateleiras e recebia mercadoria' })}
        ${campo('Resultados ou conquistas (se tiver)', `experiencias.${i}.resultados`, { area: true, largo: true, linhas: 2, ph: 'Números, metas batidas, elogios, promoções. Ex.: atendia uns 50 clientes por dia; fui funcionário do mês', dica: 'Números de verdade deixam o currículo muito mais forte.' })}
      `)).join('')}
      <button type="button" class="btn secundario" data-adicionar="experiencias">+ Adicionar outra experiência</button>`}`,
    validar: () => !R.semExperiencia && R.experiencias.some(x => !x.cargo.trim() || !x.empresa.trim())
      && 'Preencha cargo e empresa de cada experiência (ou remova as que estiverem vazias).',
  },
  {
    titulo: 'Formação',
    texto: 'Coloque sua escolaridade mais alta e cursos técnicos. Se não tem faculdade, coloque o ensino médio.',
    html: () => `
      ${R.formacao.map((x, i) => bloco('Formação', i, 'formacao', `
        ${campo('Curso', `formacao.${i}.curso`, { obrig: true, ph: 'Ex.: Ensino Médio, Técnico em Administração' })}
        ${campo('Escola / instituição', `formacao.${i}.instituicao`, { obrig: true })}
        ${escolha('Situação', `formacao.${i}.situacao`, SITUACOES_CURSO)}
        ${campo('Ano de início', `formacao.${i}.inicio`, { ph: 'Ex.: 2021' })}
        ${campo(x.situacao === 'Cursando' ? 'Previsão de conclusão' : 'Ano de conclusão', `formacao.${i}.fim`, { ph: 'Ex.: 2024' })}
      `)).join('')}
      <button type="button" class="btn secundario" data-adicionar="formacao">+ Adicionar outra formação</button>`,
    validar: () => (!R.formacao.length || R.formacao.some(x => !x.curso.trim() || !x.instituicao.trim()))
      && 'Coloque pelo menos uma formação, com curso e escola.',
  },
  {
    titulo: 'Cursos e certificados',
    texto: 'Cursos livres, online, gratuitos, do SENAI, SEBRAE, Fundação Bradesco... Tudo que tiver certificado vale. Pode pular se não tiver.',
    html: () => `
      ${R.cursos.map((x, i) => bloco('Curso', i, 'cursos', `
        ${campo('Nome do curso', `cursos.${i}.nome`, { largo: true })}
        ${campo('Instituição', `cursos.${i}.instituicao`)}
        ${campo('Ano', `cursos.${i}.ano`)}
        ${campo('Carga horária', `cursos.${i}.horas`, { ph: 'Ex.: 40h' })}
      `)).join('')}
      <button type="button" class="btn secundario" data-adicionar="cursos">+ Adicionar curso</button>`,
  },
  {
    titulo: 'Habilidades',
    texto: 'Marque só o que for verdade. Na entrevista, podem pedir um exemplo de cada uma.',
    html: () => `
      ${campo('Programas, sistemas e conhecimentos', 'ferramentas', { area: true, largo: true, linhas: 2, ph: 'Ex.: Word, Excel básico, WhatsApp Business, sistema de caixa, Canva, manutenção de computadores' })}
      <div class="m-sub">Idiomas</div>
      ${R.idiomas.map((x, i) => `<div class="m-linha">
        ${campo('Idioma', `idiomas.${i}.idioma`, { ph: 'Ex.: Inglês' })}${escolha('Nível', `idiomas.${i}.nivel`, NIVEIS)}
        <button type="button" class="link perigo" data-remover="idiomas.${i}">remover</button></div>`).join('')}
      <button type="button" class="btn secundario" data-adicionar="idiomas">+ Adicionar idioma</button>
      <div class="m-sub">Competências comportamentais</div>
      <div class="m-chips">${COMPORTAMENTAIS.map(c => `<label class="m-chip ${R.comportamentais.includes(c) ? 'on' : ''}">
        <input type="checkbox" data-comp="${c}" ${R.comportamentais.includes(c) ? 'checked' : ''}>${c}</label>`).join('')}</div>
      ${campo('Outra que não está na lista', 'outraComp', { ph: 'opcional' })}`,
  },
  {
    titulo: 'Extras',
    texto: 'Isso faz diferença, principalmente para quem está começando. Pode deixar em branco o que não tiver.',
    html: () => `<div class="m-grade">
      ${campo('Projetos (escola, faculdade, pessoais)', 'projetos', { area: true, largo: true, ph: 'Ex.: fiz um site para a loja da minha tia; organizei a feira de ciências da escola' })}
      ${campo('Trabalho voluntário', 'voluntariado', { area: true, largo: true, ph: 'Ex.: ajudo na igreja organizando eventos; voluntário na campanha do agasalho' })}
      ${campo('Outras informações importantes', 'outras', { area: true, largo: true, ph: 'Ex.: tenho moto própria; disponibilidade para viagens' })}
    </div>`,
  },
  {
    titulo: 'Revisar e gerar',
    texto: 'Confira suas respostas. A IA vai deixar tudo com linguagem profissional e organizado, sem inventar nada.',
    html: () => `<pre class="m-revisao">${esc(paraTexto(R))}</pre>`,
  },
];

// ---------- respostas em texto (é isso que a IA recebe e o que a verificação usa como "verdade") ----------
const mes = v => { if (!v) return ''; const [a, m] = v.split('-'); return `${MESES[+m - 1]}/${a}`; };
function paraTexto(r) {
  const p = r.pessoal;
  const l = [];
  const add = (rot, v) => { if (String(v || '').trim()) l.push(`${rot}: ${String(v).trim()}`); };
  add('NOME', p.nome); add('CIDADE', [p.cidade, p.uf].filter(Boolean).join(' - ')); add('TELEFONE', p.telefone);
  add('E-MAIL', p.email); add('LINKEDIN', p.linkedin); add('VAGA QUE PROCURA', p.area);
  if (p.cnh && p.cnh !== 'Não tenho') add('CNH', 'categoria ' + p.cnh);
  add('DISPONIBILIDADE', p.disponibilidade);
  l.push('', 'EXPERIÊNCIAS:');
  if (r.semExperiencia || !r.experiencias.length) l.push('Ainda não teve nenhum trabalho.');
  else r.experiencias.forEach((x, i) => {
    const periodo = [mes(x.inicio), x.atual ? 'atual' : mes(x.fim)].filter(Boolean).join(' – ');
    l.push(`${i + 1}) Cargo: ${x.cargo} | Empresa: ${x.empresa}${x.cidade ? ' | Cidade: ' + x.cidade : ''}${periodo ? ' | Período: ' + periodo : ''}`);
    if (x.atividades.trim()) l.push(`   O que fazia: ${x.atividades.trim()}`);
    if (x.resultados.trim()) l.push(`   Resultados e conquistas: ${x.resultados.trim()}`);
  });
  l.push('', 'FORMAÇÃO:');
  r.formacao.forEach(x => l.push(`- ${x.curso} | ${x.instituicao} | ${x.situacao}${x.inicio || x.fim ? ' | ' + [x.inicio, x.fim].filter(Boolean).join(' – ') : ''}`));
  if (r.cursos.some(x => x.nome.trim())) {
    l.push('', 'CURSOS E CERTIFICADOS:');
    r.cursos.filter(x => x.nome.trim()).forEach(x => l.push(`- ${[x.nome, x.instituicao, x.ano, x.horas && 'carga horária ' + x.horas].filter(Boolean).join(' | ')}`));
  }
  l.push('');
  add('PROGRAMAS, SISTEMAS E CONHECIMENTOS', r.ferramentas);
  add('IDIOMAS', r.idiomas.filter(x => x.idioma.trim()).map(x => `${x.idioma} – ${x.nivel}`).join('; '));
  add('COMPETÊNCIAS COMPORTAMENTAIS', [...r.comportamentais, r.outraComp].filter(s => s && s.trim()).join('; '));
  add('PROJETOS', r.projetos); add('TRABALHO VOLUNTÁRIO', r.voluntariado); add('OUTRAS INFORMAÇÕES', r.outras);
  return l.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- janela do passo a passo ----------
function desenharPasso() {
  const P = PASSOS[passo];
  $('mIndicador').innerHTML = PASSOS.map((x, i) =>
    `<button type="button" class="m-ind ${i === passo ? 'atual' : i < passo ? 'feito' : ''}" data-ir="${i}" title="${x.titulo}"><span>${i + 1}</span>${x.titulo}</button>`).join('');
  $('mConteudo').innerHTML = `<h2>${P.titulo}</h2><p class="ajuda">${P.texto}</p>${P.html()}<p id="mErro" class="m-erro"></p>`;
  $('mVoltar').hidden = passo === 0;
  $('mProximo').textContent = passo === PASSOS.length - 1 ? '✨ Gerar meu currículo' : 'Próximo →';
  $('mConteudo').scrollTop = 0;
}

$('mConteudo').addEventListener('input', e => {
  const c = e.target.dataset.c;
  if (c) escrever(c, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
});
$('mConteudo').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.comp) {
    R.comportamentais = t.checked ? [...R.comportamentais, t.dataset.comp] : R.comportamentais.filter(x => x !== t.dataset.comp);
    guardar();
    t.closest('.m-chip').classList.toggle('on', t.checked);
  }
  // campos que mudam o formulário: redesenha mantendo o que já foi digitado
  if (t.type === 'checkbox' && t.dataset.c || /\.situacao$/.test(t.dataset.c || '')) desenharPasso();
});
$('mConteudo').addEventListener('click', e => {
  const add = e.target.dataset.adicionar, rem = e.target.dataset.remover;
  if (add) { R[add].push(vazio[{ experiencias: 'experiencia', formacao: 'formacao', cursos: 'curso', idiomas: 'idioma' }[add]]()); guardar(); desenharPasso(); }
  if (rem) { const [lista, i] = rem.split('.'); R[lista].splice(+i, 1); guardar(); desenharPasso(); }
});
$('mIndicador').addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b && +b.dataset.ir < passo) { passo = +b.dataset.ir; desenharPasso(); }
});

$('mVoltar').onclick = () => { passo--; desenharPasso(); };
$('mProximo').onclick = async () => {
  const erro = PASSOS[passo].validar?.();
  if (erro) { $('mErro').textContent = erro; return; }
  if (passo < PASSOS.length - 1) { passo++; desenharPasso(); return; }
  // Gerar
  const botao = $('mProximo');
  botao.disabled = true;
  botao.textContent = 'Montando seu currículo… (uns 30 segundos)';
  try {
    const reg = await api('/api/montar', { method: 'POST', body: { respostas: paraTexto(R) } });
    fecharMontador();
    exibir(reg);
    carregarHistorico();
  } catch (e) {
    $('mErro').textContent = e.message;
  } finally {
    botao.disabled = false;
    botao.textContent = '✨ Gerar meu currículo';
  }
};

function abrirMontador(irPara = 0) {
  passo = irPara;
  $('montador').hidden = false;
  document.body.style.overflow = 'hidden';
  desenharPasso();
}
function fecharMontador() {
  $('montador').hidden = true;
  document.body.style.overflow = '';
}
$('abrirMontador').onclick = () => abrirMontador();
$('mFechar').onclick = fecharMontador;
$('mRecomecar').onclick = () => {
  if (!confirm('Apagar todas as respostas e começar de novo?')) return;
  R = novoRascunho(); guardar(); abrirMontador(0);
};

// ---------- resultado: aparece no lugar da análise da vaga ----------
function desenharBase(reg) {
  const r = reg.resultado;
  const lista = itens => itens?.length ? `<ul>${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  $('analise').innerHTML = `
    <h3>✨ Seu currículo está pronto</h3>
    <p class="ajuda">Revise e edite direto no currículo abaixo se quiser. Escolha o layout, baixe em PDF ou Word e, se gostar,
      use como seu currículo base: aí é só mandar as fotos das vagas para adaptar.</p>
    <div class="barra">
      <button id="usarBase" class="btn">📌 Usar como meu currículo base</button>
      <button id="editarRespostas" class="btn secundario">✏️ Voltar e editar respostas</button>
    </div>
    ${r.perguntas?.length ? `<h3>🔎 Responda para deixar ainda mais forte</h3>
      <p class="ajuda">Se souber alguma resposta, clique em "Voltar e editar respostas", acrescente e gere de novo.</p>${lista(r.perguntas)}` : ''}
    ${r.dicas?.length ? `<h3>💡 Dicas</h3>${lista(r.dicas)}` : ''}`;
  $('usarBase').onclick = async () => {
    if ($('textoCv').value.trim() && !confirm('Isso substitui o currículo base que está no passo 2. Continuar?')) return;
    $('textoCv').value = $('cv').innerText.replace(/\n{3,}/g, '\n\n').trim();
    await api('/api/curriculo', { method: 'POST', body: { texto: $('textoCv').value } });
    $('cvStatus').textContent = '✔ Currículo salvo';
    $('usarBase').textContent = '✔ Agora é o seu currículo base';
    $('usarBase').disabled = true;
  };
  $('editarRespostas').onclick = () => abrirMontador(PASSOS.length - 1);
}
