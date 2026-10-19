// Gera um .docx de verdade (Word/Gupy leem corretamente) a partir do currículo exibido na tela.
// Sem bibliotecas: monta o XML do Word e empacota num ZIP simples (sem compressão).
(function () {
  const LARGURA_TEXTO = 9638; // A4 (11906) menos margens de 2 cm, em twips

  // Aparência de cada layout no Word (tamanhos em meio-ponto, como o Word usa)
  const ESTILOS = {
    a: { // Clássico
      fonte: 'Calibri', fonteTitulo: 'Cambria', marcador: '–',
      nome: { sz: 46, cor: '111111', fonte: 'Cambria' },
      objetivo: { sz: 23, i: true, cor: '333333' },
      contatos: { sz: 19, cor: '444444' }, linhaAbaixoContatos: '222222',
      titulo: { sz: 27, b: true, smallCaps: true, cor: '111111', fonte: 'Cambria' },
      periodo: { i: true, cor: '555555' }, empresa: { cor: '444444', sz: 20 },
    },
    b: { // Minimalista
      fonte: 'Segoe UI', marcador: '•',
      nome: { sz: 42, b: true, cor: '1C1C1C' },
      objetivo: { sz: 22, cor: '555555' },
      contatos: { sz: 18, cor: '555555' },
      titulo: { sz: 19, b: true, cor: '777777' },
      periodo: { cor: '777777', sz: 18 }, empresa: { cor: '666666', sz: 18 },
    },
    c: { // Tradicional
      fonte: 'Arial', marcador: '•', centralizarCabecalho: true,
      nome: { sz: 34, b: true, caps: true, cor: '111111' },
      objetivo: { sz: 21, cor: '222222' },
      contatos: { sz: 18, cor: '222222' },
      titulo: { sz: 21, b: true, caps: true, cor: '111111' }, faixaTitulo: 'ECECEC',
      periodo: { cor: '222222' }, empresa: { cor: '333333', sz: 19 },
    },
  };

  const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const texto = el => (el?.innerText || '').replace(/\s+/g, ' ').trim();

  function run(t, o = {}) {
    if (!t) return '';
    const rpr = [
      o.fonte && `<w:rFonts w:ascii="${o.fonte}" w:hAnsi="${o.fonte}" w:cs="${o.fonte}"/>`,
      o.b && '<w:b/>', o.i && '<w:i/>', o.caps && '<w:caps/>', o.smallCaps && '<w:smallCaps/>',
      o.cor && `<w:color w:val="${o.cor}"/>`, o.sz && `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`,
    ].filter(Boolean).join('');
    return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  }
  const tab = '<w:r><w:tab/></w:r>';

  function par(runs, o = {}) {
    const ppr = [ // ordem exigida pelo formato do Word
      o.manterProximo && '<w:keepNext/>',
      o.borda && `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${o.borda}"/></w:pBdr>`,
      o.faixa && `<w:shd w:val="clear" w:color="auto" w:fill="${o.faixa}"/>`,
      o.tabDireita && `<w:tabs><w:tab w:val="right" w:pos="${LARGURA_TEXTO}"/></w:tabs>`,
      `<w:spacing w:before="${o.antes || 0}" w:after="${o.depois ?? 40}"/>`,
      o.recuo && '<w:ind w:left="284" w:hanging="200"/>',
      o.centro ? '<w:jc w:val="center"/>' : o.justificado && '<w:jc w:val="both"/>',
    ].filter(Boolean).join('');
    return `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
  }

  // Converte cada bloco do currículo (h1, h2, experiência, listas...) em parágrafos do Word.
  function corpo(cv, E) {
    const out = [];
    const centro = !!E.centralizarCabecalho;
    const lista = ul => ul.querySelectorAll(':scope > li').forEach(li =>
      out.push(par(run(E.marcador) + tab + run(texto(li)), { recuo: true, depois: 20 })));
    for (const el of cv.children) {
      const c = el.classList;
      if (el.tagName === 'H1') out.push(par(run(texto(el), E.nome), { depois: 20, centro }));
      else if (c.contains('objetivo')) out.push(par(run(texto(el), E.objetivo), { depois: 20, centro }));
      else if (c.contains('contatos')) out.push(par(run(texto(el), E.contatos), { depois: 120, centro, borda: E.linhaAbaixoContatos }));
      else if (el.tagName === 'H2') out.push(par(run(texto(el), E.titulo), { faixa: E.faixaTitulo, antes: 200, depois: 80, manterProximo: true }));
      else if (el.tagName === 'UL') lista(el);
      else if (c.contains('exp')) {
        const topo = el.querySelector('.exp-topo');
        if (topo) {
          const cargo = texto(topo.querySelector('strong')), periodo = texto(topo.querySelector('.periodo'));
          out.push(par(run(cargo, { b: true, sz: 22 }) + (periodo ? tab + run(periodo, E.periodo) : ''), { tabDireita: true, antes: 80, depois: 0, manterProximo: true }));
        }
        const empresa = el.querySelector('.empresa');
        if (empresa && texto(empresa)) out.push(par(run(texto(empresa), E.empresa), { depois: 20 }));
        el.querySelectorAll('ul').forEach(lista);
      } else if (texto(el)) out.push(par(run(texto(el)), { justificado: true, depois: 60 }));
    }
    return out.join('');
  }

  const estilos = fonte => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>'
    + `<w:rFonts w:ascii="${fonte}" w:hAnsi="${fonte}" w:eastAsia="${fonte}" w:cs="${fonte}"/>`
    + '<w:color w:val="1A1A1A"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';

  const ARQUIVOS_FIXOS = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  };

  function documento(cv, E) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + corpo(cv, E)
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1021" w:right="1134" w:bottom="1021" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
      + '</w:body></w:document>';
  }

  // ---- ZIP mínimo (método "store") ----
  const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (const b of bytes) c = TABELA_CRC[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(arquivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let offset = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const n = enc.encode(nome), dados = enc.encode(conteudo), crc = crc32(dados);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
      local.setUint32(14, crc, true); local.setUint32(18, dados.length, true); local.setUint32(22, dados.length, true);
      local.setUint16(26, n.length, true); local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), n, dados);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, dados.length, true); cd.setUint32(24, dados.length, true);
      cd.setUint16(28, n.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), n);
      offset += 30 + n.length + dados.length;
    }
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    const qtd = Object.keys(arquivos).length;
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, qtd, true); fim.setUint16(10, qtd, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, offset, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  window.gerarDocx = (cv, layout = 'a') => {
    const E = ESTILOS[layout] || ESTILOS.a;
    return zip({ ...ARQUIVOS_FIXOS, 'word/styles.xml': estilos(E.fonte), 'word/document.xml': documento(cv, E) });
  };
})();
