const apiBase = "http://localhost:8000";
  let currentMetas = null;

  function formatCurrency(v) {
    if (v === null || v === undefined || isNaN(v)) return "R$ 0,00";
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function buildDateFromPartitions(data) {
    const dd = String(data.day_partition).padStart(2, "0");
    const mm = String(data.month_partition).padStart(2, "0");
    const yyFull = String(data.year_partition);
    const yy = yyFull.slice(-2);
    const full = `${dd}/${mm}/${yy}`;
    const period = `01/${mm}/${yy} até ${full}`;
    return { fullDate: full, period, dd, mm, yy };
  }

  // Escala 0..4: 0 = início, 1 = alvo1, 2 = alvo2, 3 = alvo3, 4 = alvo4
  function getTierProgress(total, a1, a2, a3, a4) {
    total = Number(total) || 0;
    a1   = Number(a1) || 0;
    a2   = Number(a2) || 0;
    a3   = Number(a3) || 0;
    a4   = Number(a4) || 0;

    if (a1 <= 0 || total <= 0) return 0;

    let p; // posição 0..4

    if (total <= a1) {
      p = (total / a1);
    } else if (!a2 || total <= a2) {
      const base = a1;
      const topo = a2 || a1;
      const frac = (total - base) / ((topo - base) || 1);
      p = 1 + Math.max(0, Math.min(1, frac));
    } else if (!a3 || total <= a3) {
      const base = a2;
      const topo = a3 || a2;
      const frac = (total - base) / ((topo - base) || 1);
      p = 2 + Math.max(0, Math.min(1, frac));
    } else if (!a4 || total <= a4) {
      const base = a3;
      const topo = a4 || a3;
      const frac = (total - base) / ((topo - base) || 1);
      p = 3 + Math.max(0, Math.min(1, frac));
    } else {
      p = 4;
    }

    return Math.max(0, Math.min(100, (p / 4) * 100));
  }

  function getStepStates(total, a1, a2, a3, a4) {
    total = Number(total) || 0;
    a1 = Number(a1) || 0;
    a2 = Number(a2) || 0;
    a3 = Number(a3) || 0;
    a4 = Number(a4) || 0;

    return [
      total > 0,
      a1 > 0 && total >= a1,
      a2 > 0 && total >= a2,
      a3 > 0 && total >= a3,
      a4 > 0 && total >= a4
    ];
  }

  function getAlvoFromTotal(total, a1, a2, a3, a4) {
    if (!a1 && !a2 && !a3 && !a4) {
      return { idx: null, labelBadge: "Meta não configurada", labelText: "Meta não configurada" };
    }

    total = Number(total) || 0;
    a1 = Number(a1) || 0;
    a2 = Number(a2) || 0;
    a3 = Number(a3) || 0;
    a4 = Number(a4) || 0;

    if (total >= a4 && a4 > 0) {
      return { idx: 4, labelBadge: "Alvo 04", labelText: "Alvo 4" };
    } else if (total >= a3 && a3 > 0) {
      return { idx: 3, labelBadge: "Alvo 03", labelText: "Alvo 3" };
    } else if (total >= a2 && a2 > 0) {
      return { idx: 2, labelBadge: "Alvo 02", labelText: "Alvo 2" };
    } else if (total >= a1 && a1 > 0) {
      return { idx: 1, labelBadge: "Alvo 01", labelText: "Alvo 1" };
    } else {
      return { idx: 0, labelBadge: "Abaixo Alvo 01", labelText: "Abaixo do alvo 1" };
    }
  }

  function getNextTargetInfo(total, a1, a2, a3, a4, f1, f2, f3, f4) {
    const faixa = getAlvoFromTotal(total, a1, a2, a3, a4);
    let missing = 0;
    let alvoNum = null;

    total = Number(total) || 0;
    a1 = Number(a1) || 0;
    a2 = Number(a2) || 0;
    a3 = Number(a3) || 0;
    a4 = Number(a4) || 0;

    f1 = (f1 == null ? null : Number(f1));
    f2 = (f2 == null ? null : Number(f2));
    f3 = (f3 == null ? null : Number(f3));
    f4 = (f4 == null ? null : Number(f4));

    switch (faixa.idx) {
      case 0:
        alvoNum = 1;
        missing = f1 != null ? f1 : Math.max(0, (a1 || 0) - total);
        break;
      case 1:
        alvoNum = 2;
        missing = f2 != null ? f2 : Math.max(0, (a2 || 0) - total);
        break;
      case 2:
        alvoNum = 3;
        missing = f3 != null ? f3 : Math.max(0, (a3 || 0) - total);
        break;
      case 3:
        alvoNum = 4;
        missing = f4 != null ? f4 : Math.max(0, (a4 || 0) - total);
        break;
      case 4:
        return {
          text: "Você já atingiu o Alvo 4. Continue vendendo para potencializar sua premiação.",
          missing: 0,
          reachedMax: true
        };
      default:
        return {
          text: "Metas não configuradas para este indicador.",
          missing: 0,
          reachedMax: false
        };
    }

    if (!missing || missing <= 0) {
      return {
        text: `Você está muito próximo do Alvo 0${alvoNum}. Qualquer venda adicional ajuda a consolidar o resultado.`,
        missing: 0,
        reachedMax: false
      };
    }

    return {
      text: `Venda ${formatCurrency(missing)} para atingir o Alvo 0${alvoNum}.`,
      missing,
      reachedMax: false
    };
  }

  function getPremiacaoBase(metas, tipo, alvoIdx) {
    if (!metas || !alvoIdx || alvoIdx < 1 || alvoIdx > 4) return 0;

    const baseMap = {
      mercantil: "premiacao_mercantil_alvo_",
      estrela: "premiacao_produto_incentivado_alvo_",
      servicos: "premiacao_servicos_alvo_",
      cdc: "premiacao_cdc_alvo_"
    };

    const base = baseMap[tipo];
    if (!base) return 0;

    const key = base + alvoIdx;
    const v = metas[key];
    return v != null ? Number(v) : 0;
  }

  function getConjuntoAlvo2Info(metas, mercRealTotal, servRealTotal, cdcRealTotal) {
    if (!metas) return { flag: false, mult: 1 };

    const mult = metas.multiplicador_se_alvo_2_mercantil_cdc_servicos_atingido
      ? Number(metas.multiplicador_se_alvo_2_mercantil_cdc_servicos_atingido)
      : 1;

    const a2Merc = Number(metas.alvo_2_mercantil || 0);
    const a2Serv = Number(metas.alvo_2_servicos || 0);
    const a2Cdc  = Number(metas.alvo_2_cdc || 0);

    if (!a2Merc || !a2Serv || !a2Cdc || mult <= 1) {
      return { flag: false, mult: 1 };
    }

    const cond =
      mercRealTotal >= a2Merc &&
      servRealTotal >= a2Serv &&
      cdcRealTotal  >= a2Cdc;

    return { flag: cond, mult: cond ? mult : 1 };
  }

  function renderColaboradorInfo(resultados, detalhes) {
    const el = document.getElementById("colaboradorInfo");
    const { fullDate } = buildDateFromPartitions(resultados);
    const hora = (resultados.horario_atualizacao || "").substring(0,5);

    const nome = detalhes?.vendedor_nome || "—";
    const regional = detalhes?.regional || "—";
    const diretoria = detalhes?.diretoria || "—";

    el.innerHTML = `
      <div><span class="label">Matrícula:</span> ${resultados.matricula}</div>
      <div><span class="label">Nome:</span> ${nome}</div>
      <div><span class="label">Cargo:</span> Vendedor</div>
      <div><span class="label">Filial:</span> ${resultados.filial}</div>
      <div><span class="label">Regional:</span> ${regional}</div>
      <div><span class="label">Diretoria:</span> ${diretoria}</div>
      <div><span class="label">Última atualização:</span> ${fullDate} às ${hora}</div>
    `;
  }

  function renderResumoDias(detalhes, detalhesDia) {
    const box = document.getElementById("summaryDays");

    if (!detalhes && !detalhesDia) {
      box.style.display = "none";
      return;
    }

    const diasAcm = detalhes?.dias_trabalhados_acm ?? 0;

    let diasMes = 0;
    if (detalhesDia && detalhesDia.qt_dias_trabalho != null) {
      diasMes = detalhesDia.qt_dias_trabalho;
    } else if (detalhes && detalhes.dias_trabalhados_totais_no_mes != null) {
      diasMes = detalhes.dias_trabalhados_totais_no_mes;
    }

    const qtMes  = detalhesDia?.qt_dias_mes ?? "-";
    const qtFolga = detalhesDia?.qt_dias_folga ?? 0;
    const qtSub = detalhesDia?.qt_dias_substituicao ?? 0;
    const qtOutros = detalhesDia?.qt_dias_outros ?? 0;
    const qtInc = detalhesDia?.qt_dias_inconsistentes ?? 0;

    document.getElementById("itemTotalMes").innerHTML = `
      <div class="summary-label">Total dias no mês</div>
      <div class="summary-value">${qtMes}</div>
    `;

    document.getElementById("itemDiasMes").innerHTML = `
      <div class="summary-label">Dias trabalhados no mês</div>
      <div class="summary-value">${diasMes}</div>
    `;

    document.getElementById("itemFolga").innerHTML = `
      <div class="summary-label">Folga/Férias/Afast.</div>
      <div class="summary-value">${qtFolga}</div>
    `;

    document.getElementById("itemSubstituicao").innerHTML = `
      <div class="summary-label">Substituição</div>
      <div class="summary-value">${qtSub}</div>
    `;

    document.getElementById("itemOutros").innerHTML = `
      <div class="summary-label">Outros (domingo/feriado)</div>
      <div class="summary-value">${qtOutros}</div>
    `;

    document.getElementById("itemInconsistentes").innerHTML = `
      <div class="summary-label">Inconsistentes</div>
      <div class="summary-value">${qtInc}</div>
    `;

    document.getElementById("itemDiasAcm").innerHTML = `
      <div class="summary-label">Dias trabalhados acumulados</div>
      <div class="summary-value">${diasAcm}</div>
    `;

    box.style.display = "flex";
  }

  function calcularCompensacao(alvo2, detalhesDia) {
    if (!detalhesDia) return 0;
    const totalDiasMes = detalhesDia.qt_dias_mes ?? 0;
    const diasFolga = detalhesDia.qt_dias_folga ?? 0;
    if (!alvo2 || totalDiasMes <= 0 || diasFolga <= 0) return 0;
    return (alvo2 / totalDiasMes) * diasFolga;
  }

  function getCompensacaoHint(alvo2, detalhesDia) {
    const totalDiasMes = detalhesDia?.qt_dias_mes ?? 0;
    const diasFolga = detalhesDia?.qt_dias_folga ?? 0;
    const alvo2Number = Number(alvo2) || 0;

    if (!detalhesDia) {
      return "Comp. ausência = 0 (sem detalhes de dias no período).";
    }

    if (!alvo2Number) {
      return "Comp. ausência = 0 (Alvo 2 não informado).";
    }

    if (totalDiasMes <= 0) {
      return "Comp. ausência = 0 (total de dias do mês não informado).";
    }

    if (diasFolga <= 0) {
      return "Comp. ausência = 0 (sem dias de folga/ausência autorizada).";
    }

    const diaria = alvo2Number / totalDiasMes;
    const valor = diaria * diasFolga;

    return `Comp. ausência = (${formatCurrency(alvo2Number)} ÷ ${totalDiasMes} dias) × ${diasFolga} dia(s) = ${formatCurrency(valor)}`;
  }

  function escapeAttribute(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildHintBubble(text, label = "Como calculamos a compensação") {
    const safe = escapeAttribute(text);
    if (!safe) return "";

    return `
      <span class="hint-inline" title="${safe}">
        <span class="hint-icon">i</span>
        <span class="hint-label">${label}</span>
      </span>
    `;
  }

  function renderResumoFinanceiro(data, detalhesDia, metas) {
    const box = document.getElementById("summaryFinance");
    const finalCard = document.getElementById("finPremioFinalGlobal");

    if (!data) {
      box.style.display = "none";
      finalCard.style.display = "none";
      return;
    }

    /* BASES DE REALIZADO */
    const mercReal = data.mercantil_real_acm ?? 0;
    const mercBonus = data.mercantil_real_bonusisolado_acm ?? 0;
    const mercBonusHalf = mercBonus * 0.5;
    const mercLoja = data.mercantil_real_off_acm ?? 0;
    const mercOn = data.mercantil_real_on_acm ?? 0;

    const estReal = data.mercantil_incentivado_real_acm ?? 0;
    const estLoja = data.mercantil_incentivado_real_off_acm ?? 0;
    const estOn = data.mercantil_incentivado_real_on_acm ?? 0;

    const servReal = data.servicos_real_acm ?? 0;
    const servLoja = data.servicos_real_off_acm ?? 0;
    const servOn = data.servicos_real_on_acm ?? 0;

    const cdcReal = data.cdc_real_acm ?? 0;
    const cdcLoja = data.cdc_real_off_acm ?? 0;
    const cdcOn = data.cdc_real_on_acm ?? 0;

    /* COMPENSAÇÃO POR AUSÊNCIA */
    const compMerc = calcularCompensacao(data.mercantil_alvo_2, detalhesDia);
    const compServ = calcularCompensacao(data.servicos_alvo_2, detalhesDia);
    const compCdc  = calcularCompensacao(data.cdc_alvo_2, detalhesDia);

    const compMercHint = buildHintBubble(
      getCompensacaoHint(data.mercantil_alvo_2, detalhesDia)
    );
    const compServHint = buildHintBubble(
      getCompensacaoHint(data.servicos_alvo_2, detalhesDia)
    );
    const compCdcHint  = buildHintBubble(
      getCompensacaoHint(data.cdc_alvo_2, detalhesDia)
    );

    /* REALIZADO TOTAL PARA META (mesma lógica que você vinha usando) */
    const mercRealTotal = mercReal + mercBonusHalf + compMerc;
    const estRealTotal  = estReal;
    const servRealTotal = servReal + compServ;
    const cdcRealTotal  = cdcReal + compCdc;

    /* FAIXA DE META (ALVO) DE CADA TIPO */
    const mercAlvoInfo = getAlvoFromTotal(
      mercRealTotal,
      data.mercantil_alvo_1,
      data.mercantil_alvo_2,
      data.mercantil_alvo_3,
      data.mercantil_alvo_4
    );

    const estAlvoInfo = getAlvoFromTotal(
      estRealTotal,
      data.mercantil_incentivado_alvo_1,
      data.mercantil_incentivado_alvo_2,
      data.mercantil_incentivado_alvo_3,
      data.mercantil_incentivado_alvo_4
    );

    const servAlvoInfo = getAlvoFromTotal(
      servRealTotal,
      data.servicos_alvo_1,
      data.servicos_alvo_2,
      data.servicos_alvo_3,
      data.servicos_alvo_4
    );

    const cdcAlvoInfo = getAlvoFromTotal(
      cdcRealTotal,
      data.cdc_alvo_1,
      data.cdc_alvo_2,
      data.cdc_alvo_3,
      data.cdc_alvo_4
    );

    /* MULTIPLICADOR CONJUNTO ALVO 2 (MERCANTIL + SERVIÇOS + CDC) */
    const conjInfo = getConjuntoAlvo2Info(
      metas,
      mercRealTotal,
      servRealTotal,
      cdcRealTotal
    );

    const multMerc = (conjInfo.flag && conjInfo.mult > 1);
    const multServ = (conjInfo.flag && conjInfo.mult > 1);
    const multCdc  = (conjInfo.flag && conjInfo.mult > 1);
    const multEst  = false; // Produto estrela não participa

    /* PREMIACÃO BASE POR TIPO (PELO ALVO) */
    const mercPremioBase = getPremiacaoBase(metas, "mercantil", mercAlvoInfo.idx);
    const estPremioBase  = getPremiacaoBase(metas, "estrela",   estAlvoInfo.idx);
    const servPremioBase = getPremiacaoBase(metas, "servicos",  servAlvoInfo.idx);
    const cdcPremioBase  = getPremiacaoBase(metas, "cdc",       cdcAlvoInfo.idx);

    /* VALOR TOTAL DE PREMIAÇÃO (APLICANDO MULTIPLICADOR X2 QUANDO SIM) */
    const mercValorTotalPremio = mercPremioBase * (multMerc ? conjInfo.mult : 1);
    const estValorTotalPremio  = estPremioBase  * 1;
    const servValorTotalPremio = servPremioBase * (multServ ? conjInfo.mult : 1);
    const cdcValorTotalPremio  = cdcPremioBase  * (multCdc  ? conjInfo.mult : 1);

    const valorFinalGlobal = mercValorTotalPremio +
                             estValorTotalPremio  +
                             servValorTotalPremio +
                             cdcValorTotalPremio;

    /* ---- CARDS MERCANTIL ---- */
    document.getElementById("finMercantilBase").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">Mercantil</div>
        <div class="summary-fin-tag">Sem incentivo</div>
      </div>
      <div class="summary-fin-label">Valor total (sem incentivo)</div>
      <div class="summary-fin-value">${formatCurrency(mercReal)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Loja:</span> ${formatCurrency(mercLoja)}</div>
        <div><span class="label">On-line:</span> ${formatCurrency(mercOn)}</div>
        <div><span class="label">Comp. ausência:</span> ${formatCurrency(compMerc)}</div>
        <div class="summary-fin-hint">${compMercHint}</div>
      </div>
    `;

    document.getElementById("finMercantilBonus").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">Incentivo LL/Móveis</div>
        <div class="summary-fin-tag">Mercantil</div>
      </div>
      <div class="summary-fin-label">Valor total incentivo</div>
      <div class="summary-fin-value">${formatCurrency(mercBonus)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Incentivo acumulado:</span> ${formatCurrency(mercBonus)}</div>
        <div><span class="label">50% usado no realizado:</span> ${formatCurrency(mercBonusHalf)}</div>
      </div>
    `;

    document.getElementById("finMercantilBonus50").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">Incentivo LL/Móveis</div>
        <div class="summary-fin-tag">x 0,5</div>
      </div>
      <div class="summary-fin-label">Valor estimado</div>
      <div class="summary-fin-value">${formatCurrency(mercBonusHalf)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Cálculo:</span> ${formatCurrency(mercBonus)} × 0,5</div>
      </div>
    `;

    document.getElementById("finMercantilTotalCard").innerHTML = `
      <div class="summary-fin-total-badge">${mercAlvoInfo.labelBadge}</div>
      <div class="summary-fin-total-title">Realizado Total - Mercantil</div>
      <div class="summary-fin-total-sub">Mercantil + 50% incentivo + compensação</div>
      <div class="summary-fin-total-value">${formatCurrency(mercRealTotal)}</div>
      <div class="summary-fin-total-extra">
        <div><span class="label">Faixa de meta:</span> ${mercAlvoInfo.labelText}</div>
        <div><span class="label">Base:</span> ${formatCurrency(mercReal)}</div>
        <div><span class="label">+ 50% Incentivo:</span> ${formatCurrency(mercBonusHalf)}</div>
        <div><span class="label">+ Comp. ausência:</span> ${formatCurrency(compMerc)}</div>
        <div class="summary-fin-hint">${compMercHint}</div>
      </div>
    `;

    document.getElementById("finMercantilPremioCard").innerHTML = `
      <div class="summary-fin-total-title">Premiação mercantil</div>
      <div class="summary-fin-total-sub">De acordo com o alvo atingido</div>
      <div class="summary-fin-total-value">${formatCurrency(mercPremioBase)}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Alvo:</span> ${mercAlvoInfo.labelText}
      </div>
    `;

    document.getElementById("finMercantilMultiCard").innerHTML = `
      <div class="summary-fin-total-title">Multiplicador x2</div>
      <div class="summary-fin-total-sub">Alvo 2 conjunto (Merc + CDC + Serv)</div>
      <div class="summary-fin-total-value">${multMerc ? "Sim" : "Não"}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Fator:</span> ${multMerc ? conjInfo.mult.toFixed(2) : "1,00"}
      </div>
    `;

    document.getElementById("finMercantilValorTotalCard").innerHTML = `
      <div class="summary-fin-total-title">Valor Total</div>
      <div class="summary-fin-total-sub">Premiação mercantil aplicada</div>
      <div class="summary-fin-total-value">${formatCurrency(mercValorTotalPremio)}</div>
    `;

    /* ---- PRODUTO ESTRELA ---- */
    document.getElementById("finEstrela").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">Produto Estrela</div>
        <div class="summary-fin-tag">Valor total</div>
      </div>
      <div class="summary-fin-label">Valor total</div>
      <div class="summary-fin-value">${formatCurrency(estReal)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Loja:</span> ${formatCurrency(estLoja)}</div>
        <div><span class="label">On-line:</span> ${formatCurrency(estOn)}</div>
      </div>
    `;

    document.getElementById("finEstrelaTotalCard").innerHTML = `
      <div class="summary-fin-total-badge">${estAlvoInfo.labelBadge}</div>
      <div class="summary-fin-total-title">Realizado Total - Produto Estrela</div>
      <div class="summary-fin-total-sub">Considera o valor total do produto estrela</div>
      <div class="summary-fin-total-value">${formatCurrency(estRealTotal)}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Faixa de meta:</span> ${estAlvoInfo.labelText}
      </div>
    `;

    document.getElementById("finEstrelaPremioCard").innerHTML = `
      <div class="summary-fin-total-title">Premiação produto estrela</div>
      <div class="summary-fin-total-sub">De acordo com o alvo atingido</div>
      <div class="summary-fin-total-value">${formatCurrency(estPremioBase)}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Alvo:</span> ${estAlvoInfo.labelText}
      </div>
    `;

    document.getElementById("finEstrelaMultiCard").innerHTML = `
      <div class="summary-fin-total-title">Multiplicador x2</div>
      <div class="summary-fin-total-sub">Produto estrela não participa</div>
      <div class="summary-fin-total-value">Não</div>
      <div class="summary-fin-total-extra">
        <span class="label">Fator:</span> 1,00
      </div>
    `;

    document.getElementById("finEstrelaValorTotalCard").innerHTML = `
      <div class="summary-fin-total-title">Valor Total</div>
      <div class="summary-fin-total-sub">Premiação produto estrela</div>
      <div class="summary-fin-total-value">${formatCurrency(estValorTotalPremio)}</div>
    `;

    /* ---- SERVIÇOS ---- */
    document.getElementById("finServicos").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">Serviços</div>
        <div class="summary-fin-tag">Valor total</div>
      </div>
      <div class="summary-fin-label">Valor total</div>
      <div class="summary-fin-value">${formatCurrency(servReal)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Loja:</span> ${formatCurrency(servLoja)}</div>
        <div><span class="label">On-line:</span> ${formatCurrency(servOn)}</div>
        <div><span class="label">Comp. ausência:</span> ${formatCurrency(compServ)}</div>
        <div class="summary-fin-hint">${compServHint}</div>
      </div>
    `;

    document.getElementById("finServicosTotalCard").innerHTML = `
      <div class="summary-fin-total-badge">${servAlvoInfo.labelBadge}</div>
      <div class="summary-fin-total-title">Realizado Total - Serviços</div>
      <div class="summary-fin-total-sub">Valor + compensação por ausência autorizada</div>
      <div class="summary-fin-total-value">${formatCurrency(servRealTotal)}</div>
      <div class="summary-fin-total-extra">
        <div><span class="label">Faixa de meta:</span> ${servAlvoInfo.labelText}</div>
        <div><span class="label">Base:</span> ${formatCurrency(servReal)}</div>
        <div><span class="label">+ Comp. ausência:</span> ${formatCurrency(compServ)}</div>
        <div class="summary-fin-hint">${compServHint}</div>
      </div>
    `;

    document.getElementById("finServicosPremioCard").innerHTML = `
      <div class="summary-fin-total-title">Premiação serviços</div>
      <div class="summary-fin-total-sub">De acordo com o alvo atingido</div>
      <div class="summary-fin-total-value">${formatCurrency(servPremioBase)}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Alvo:</span> ${servAlvoInfo.labelText}
      </div>
    `;

    document.getElementById("finServicosMultiCard").innerHTML = `
      <div class="summary-fin-total-title">Multiplicador x2</div>
      <div class="summary-fin-total-sub">Alvo 2 conjunto (Merc + CDC + Serv)</div>
      <div class="summary-fin-total-value">${multServ ? "Sim" : "Não"}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Fator:</span> ${multServ ? conjInfo.mult.toFixed(2) : "1,00"}
      </div>
    `;

    document.getElementById("finServicosValorTotalCard").innerHTML = `
      <div class="summary-fin-total-title">Valor Total</div>
      <div class="summary-fin-total-sub">Premiação serviços aplicada</div>
      <div class="summary-fin-total-value">${formatCurrency(servValorTotalPremio)}</div>
    `;

    /* ---- CDC ---- */
    document.getElementById("finCdc").innerHTML = `
      <div class="summary-fin-header">
        <div class="summary-fin-title">CDC</div>
        <div class="summary-fin-tag">Valor total</div>
      </div>
      <div class="summary-fin-label">Valor total</div>
      <div class="summary-fin-value">${formatCurrency(cdcReal)}</div>
      <div class="summary-fin-details">
        <div><span class="label">Loja:</span> ${formatCurrency(cdcLoja)}</div>
        <div><span class="label">On-line:</span> ${formatCurrency(cdcOn)}</div>
        <div><span class="label">Comp. ausência:</span> ${formatCurrency(compCdc)}</div>
        <div class="summary-fin-hint">${compCdcHint}</div>
      </div>
    `;

    document.getElementById("finCdcTotalCard").innerHTML = `
      <div class="summary-fin-total-badge">${cdcAlvoInfo.labelBadge}</div>
      <div class="summary-fin-total-title">Realizado Total - CDC</div>
      <div class="summary-fin-total-sub">Valor + compensação por ausência autorizada</div>
      <div class="summary-fin-total-value">${formatCurrency(cdcRealTotal)}</div>
      <div class="summary-fin-total-extra">
        <div><span class="label">Faixa de meta:</span> ${cdcAlvoInfo.labelText}</div>
        <div><span class="label">Base:</span> ${formatCurrency(cdcReal)}</div>
        <div><span class="label">+ Comp. ausência:</span> ${formatCurrency(compCdc)}</div>
        <div class="summary-fin-hint">${compCdcHint}</div>
      </div>
    `;

    document.getElementById("finCdcPremioCard").innerHTML = `
      <div class="summary-fin-total-title">Premiação CDC</div>
      <div class="summary-fin-total-sub">De acordo com o alvo atingido</div>
      <div class="summary-fin-total-value">${formatCurrency(cdcPremioBase)}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Alvo:</span> ${cdcAlvoInfo.labelText}
      </div>
    `;

    document.getElementById("finCdcMultiCard").innerHTML = `
      <div class="summary-fin-total-title">Multiplicador x2</div>
      <div class="summary-fin-total-sub">Alvo 2 conjunto (Merc + CDC + Serv)</div>
      <div class="summary-fin-total-value">${multCdc ? "Sim" : "Não"}</div>
      <div class="summary-fin-total-extra">
        <span class="label">Fator:</span> ${multCdc ? conjInfo.mult.toFixed(2) : "1,00"}
      </div>
    `;

    document.getElementById("finCdcValorTotalCard").innerHTML = `
      <div class="summary-fin-total-title">Valor Total</div>
      <div class="summary-fin-total-sub">Premiação CDC aplicada</div>
      <div class="summary-fin-total-value">${formatCurrency(cdcValorTotalPremio)}</div>
    `;

    /* CARD FINAL GLOBAL */
    finalCard.innerHTML = `
      <div>
        <div class="summary-fin-final-title">Valor Final de Premiação</div>
        <div class="summary-fin-final-hint">
          Soma dos valores totais de Premiação (Mercantil, Produto Estrela, Serviços e CDC),
          considerando o multiplicador x2 quando aplicável.
        </div>
      </div>
      <div class="summary-fin-final-value">${formatCurrency(valorFinalGlobal)}</div>
    `;
    finalCard.style.display = "flex";

    box.style.display = "flex";
  }

  function renderMercantilCard(data, detalhesDia) {
    const alvo1 = data.mercantil_alvo_1;
    const alvo2 = data.mercantil_alvo_2;
    const alvo3 = data.mercantil_alvo_3;
    const alvo4 = data.mercantil_alvo_4;

    const realizadoMercantil = data.mercantil_real_acm;
    const bonusIsolado = data.mercantil_real_bonusisolado_acm;
    const realizadoTotal = data.mercantil_real_bonussomado_acm ?? (realizadoMercantil + bonusIsolado);
    const loja = data.mercantil_real_off_acm;
    const online = data.mercantil_real_on_acm;

    const falt1 = data.mercantil_faltante_alvo_1;
    const falt2 = data.mercantil_faltante_alvo_2;
    const falt3 = data.mercantil_faltante_alvo_3;
    const falt4 = data.mercantil_faltante_alvo_4;

    const pct = getTierProgress(realizadoTotal, alvo1, alvo2, alvo3, alvo4);
    const compensacao = calcularCompensacao(alvo2, detalhesDia);
    const ctaInfo = getNextTargetInfo(
      realizadoTotal,
      alvo1, alvo2, alvo3, alvo4,
      falt1, falt2, falt3, falt4
    );

    const stepsActive = getStepStates(realizadoTotal, alvo1, alvo2, alvo3, alvo4);

    const el = document.getElementById("mercantilCard");
    el.innerHTML = `
      <div class="result-header">
        <div class="result-title">Mercantil</div>
        <div class="badge-pill">Meta 1–4</div>
      </div>
      <div class="target-values">
        <span>0</span>
        <span>${formatCurrency(alvo1)}</span>
        <span>${formatCurrency(alvo2)}</span>
        <span>${formatCurrency(alvo3)}</span>
        <span>${formatCurrency(alvo4)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;"></div>
      </div>
      <div class="steps steps-mercantil">
        <span class="step-dot ${stepsActive[0] ? 'active' : ''}">0</span>
        <span class="step-dot ${stepsActive[1] ? 'active' : ''}">1</span>
        <span class="step-dot ${stepsActive[2] ? 'active' : ''}">2</span>
        <span class="step-dot ${stepsActive[3] ? 'active' : ''}">3</span>
        <span class="step-dot ${stepsActive[4] ? 'active' : ''}">4</span>
      </div>
      <div class="metric-main mercantil">${formatCurrency(realizadoTotal)}</div>
      <div class="metric-lines">
        <p><span class="label">Realizado Mercantil:</span> ${formatCurrency(realizadoMercantil)}</p>
        <p><span class="label">Incentivo LL/Móveis:</span> ${formatCurrency(bonusIsolado)}</p>
        <p>
          <span class="label">Loja:</span> ${formatCurrency(loja)}
          &nbsp;&nbsp;
          <span class="label">On-line:</span> ${formatCurrency(online)}
        </p>
        <p class="comp-block">
          <span class="label">Compensação por ausência autorizada:</span>
          ${formatCurrency(compensacao)}
        </p>
      </div>
      <div class="cta">
        <span class="cta-icon">⚡</span>
        <span>${ctaInfo.text}</span>
      </div>
    `;
  }

  function renderProdutoEstrelaCard(data) {
    const alvo1 = data.mercantil_incentivado_alvo_1;
    const alvo2 = data.mercantil_incentivado_alvo_2;
    const alvo3 = data.mercantil_incentivado_alvo_3;
    const alvo4 = data.mercantil_incentivado_alvo_4;

    const realizado = data.mercantil_incentivado_real_acm;
    const loja = data.mercantil_incentivado_real_off_acm;
    const online = data.mercantil_incentivado_real_on_acm;

    const falt1 = data.mercantil_incentivado_faltante_alvo_1;
    const falt2 = data.mercantil_incentivado_faltante_alvo_2;
    const falt3 = data.mercantil_incentivado_faltante_alvo_3;
    const falt4 = data.mercantil_incentivado_faltante_alvo_4;

    const pct = getTierProgress(realizado, alvo1, alvo2, alvo3, alvo4);
    const ctaInfo = getNextTargetInfo(
      realizado,
      alvo1, alvo2, alvo3, alvo4,
      falt1, falt2, falt3, falt4
    );

    const stepsActive = getStepStates(realizado, alvo1, alvo2, alvo3, alvo4);

    const el = document.getElementById("produtoEstrelaCard");
    el.innerHTML = `
      <div class="result-header">
        <div class="result-title">Produto Estrela</div>
        <div class="badge-pill" style="background:#fff4df;color:#b35b00;">Campanha</div>
      </div>
      <div class="target-values">
        <span>0</span>
        <span>${formatCurrency(alvo1)}</span>
        <span>${formatCurrency(alvo2)}</span>
        <span>${formatCurrency(alvo3)}</span>
        <span>${formatCurrency(alvo4)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#ff9f1a,#ffc861);"></div>
      </div>
      <div class="steps steps-estrela">
        <span class="step-dot ${stepsActive[0] ? 'active' : ''}">0</span>
        <span class="step-dot ${stepsActive[1] ? 'active' : ''}">1</span>
        <span class="step-dot ${stepsActive[2] ? 'active' : ''}">2</span>
        <span class="step-dot ${stepsActive[3] ? 'active' : ''}">3</span>
        <span class="step-dot ${stepsActive[4] ? 'active' : ''}">4</span>
      </div>
      <div class="metric-main star">${formatCurrency(realizado)}</div>
      <div class="metric-lines">
        <p><span class="label">Loja:</span> ${formatCurrency(loja)}</p>
        <p><span class="label">On-line:</span> ${formatCurrency(online)}</p>
      </div>
      <div class="cta" style="background:#fff4df;color:#b35b00;">
        <span class="cta-icon">⚡</span>
        <span>${ctaInfo.text}</span>
      </div>
    `;
  }

  function renderServicosCard(data, detalhesDia) {
    const alvo1 = data.servicos_alvo_1;
    const alvo2 = data.servicos_alvo_2;
    const alvo3 = data.servicos_alvo_3;
    const alvo4 = data.servicos_alvo_4;

    const realizado = data.servicos_real_acm;
    const loja = data.servicos_real_off_acm;
    const online = data.servicos_real_on_acm;

    const falt1 = data.servicos_faltante_alvo_1;
    const falt2 = data.servicos_faltante_alvo_2;
    const falt3 = data.servicos_faltante_alvo_3;
    const falt4 = data.servicos_faltante_alvo_4;

    const pct = getTierProgress(realizado, alvo1, alvo2, alvo3, alvo4);
    const compensacao = calcularCompensacao(alvo2, detalhesDia);
    const ctaInfo = getNextTargetInfo(
      realizado,
      alvo1, alvo2, alvo3, alvo4,
      falt1, falt2, falt3, falt4
    );

    const stepsActive = getStepStates(realizado, alvo1, alvo2, alvo3, alvo4);

    const el = document.getElementById("servicosCard");
    el.innerHTML = `
      <div class="result-header">
        <div class="result-title">Serviços</div>
        <div class="badge-pill" style="background:#e7f9f1;color:#1b8066;">Garantias</div>
      </div>
      <div class="target-values">
        <span>0</span>
        <span>${formatCurrency(alvo1)}</span>
        <span>${formatCurrency(alvo2)}</span>
        <span>${formatCurrency(alvo3)}</span>
        <span>${formatCurrency(alvo4)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#36b37e,#79f2c0);"></div>
      </div>
      <div class="steps steps-servicos">
        <span class="step-dot ${stepsActive[0] ? 'active' : ''}">0</span>
        <span class="step-dot ${stepsActive[1] ? 'active' : ''}">1</span>
        <span class="step-dot ${stepsActive[2] ? 'active' : ''}">2</span>
        <span class="step-dot ${stepsActive[3] ? 'active' : ''}">3</span>
        <span class="step-dot ${stepsActive[4] ? 'active' : ''}">4</span>
      </div>
      <div class="metric-main servicos">${formatCurrency(realizado)}</div>
      <div class="metric-lines">
        <p><span class="label">Loja:</span> ${formatCurrency(loja)}</p>
        <p><span class="label">On-line:</span> ${formatCurrency(online)}</p>
        <p class="comp-block">
          <span class="label">Compensação por ausência autorizada:</span>
          ${formatCurrency(compensacao)}
        </p>
      </div>
      <div class="cta" style="background:#e7f9f1;color:#1b8066;">
        <span class="cta-icon">⚡</span>
        <span>${ctaInfo.text}</span>
      </div>
    `;
  }

  function renderCdcCard(data, detalhesDia) {
    const alvo1 = data.cdc_alvo_1;
    const alvo2 = data.cdc_alvo_2;
    const alvo3 = data.cdc_alvo_3;
    const alvo4 = data.cdc_alvo_4;

    const realizado = data.cdc_real_acm;
    const loja = data.cdc_real_off_acm;
    const online = data.cdc_real_on_acm;

    const falt1 = data.cdc_faltante_alvo_1;
    const falt2 = data.cdc_faltante_alvo_2;
    const falt3 = data.cdc_faltante_alvo_3;
    const falt4 = data.cdc_faltante_alvo_4;

    const pct = getTierProgress(realizado, alvo1, alvo2, alvo3, alvo4);
    const compensacao = calcularCompensacao(alvo2, detalhesDia);
    const ctaInfo = getNextTargetInfo(
      realizado,
      alvo1, alvo2, alvo3, alvo4,
      falt1, falt2, falt3, falt4
    );

    const stepsActive = getStepStates(realizado, alvo1, alvo2, alvo3, alvo4);

    const el = document.getElementById("cdcCard");
    el.innerHTML = `
      <div class="result-header">
        <div class="result-title">CDC</div>
        <div class="badge-pill" style="background:#ffe3e0;color:#b12a18;">Crédito</div>
      </div>
      <div class="target-values">
        <span>0</span>
        <span>${formatCurrency(alvo1)}</span>
        <span>${formatCurrency(alvo2)}</span>
        <span>${formatCurrency(alvo3)}</span>
        <span>${formatCurrency(alvo4)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#ff5630,#ff9f1a);"></div>
      </div>
      <div class="steps steps-cdc">
        <span class="step-dot ${stepsActive[0] ? 'active' : ''}">0</span>
        <span class="step-dot ${stepsActive[1] ? 'active' : ''}">1</span>
        <span class="step-dot ${stepsActive[2] ? 'active' : ''}">2</span>
        <span class="step-dot ${stepsActive[3] ? 'active' : ''}">3</span>
        <span class="step-dot ${stepsActive[4] ? 'active' : ''}">4</span>
      </div>
      <div class="metric-main cdc">${formatCurrency(realizado)}</div>
      <div class="metric-lines">
        <p><span class="label">Loja:</span> ${formatCurrency(loja)}</p>
        <p><span class="label">On-line:</span> ${formatCurrency(online)}</p>
        <p class="comp-block">
          <span class="label">Compensação por ausência autorizada:</span>
          ${formatCurrency(compensacao)}
        </p>
      </div>
      <div class="cta" style="background:#ffe3e0;color:#b12a18;">
        <span class="cta-icon">⚡</span>
        <span>${ctaInfo.text}</span>
      </div>
    `;
  }

  function renderMetasModal(metas) {
    const body = document.getElementById("metasModalBody");
    if (!metas) {
      body.innerHTML = "<p>Metas não encontradas para este mês.</p>";
      return;
    }

    const ano = metas.year_partition || "";
    const mes = metas.month_partition || "";
    document.getElementById("metasModalTitle").textContent =
      `Metas e premiação do mês ${String(mes).padStart(2, "0")}/${ano}`;

    body.innerHTML = `
      <table class="metas-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Alvo 1<br>(Meta / Premiação)</th>
            <th>Alvo 2<br>(Meta / Premiação)</th>
            <th>Alvo 3<br>(Meta / Premiação)</th>
            <th>Alvo 4<br>(Meta / Premiação)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="metas-mercantil">
            <td>Mercantil</td>
            <td>${formatCurrency(metas.alvo_1_mercantil)}<br><strong>${formatCurrency(metas.premiacao_mercantil_alvo_1)}</strong></td>
            <td>${formatCurrency(metas.alvo_2_mercantil)}<br><strong>${formatCurrency(metas.premiacao_mercantil_alvo_2)}</strong></td>
            <td>${formatCurrency(metas.alvo_3_mercantil)}<br><strong>${formatCurrency(metas.premiacao_mercantil_alvo_3)}</strong></td>
            <td>${formatCurrency(metas.alvo_4_mercantil)}<br><strong>${formatCurrency(metas.premiacao_mercantil_alvo_4)}</strong></td>
          </tr>
          <tr class="metas-servicos">
            <td>Serviços</td>
            <td>${formatCurrency(metas.alvo_1_servicos)}<br><strong>${formatCurrency(metas.premiacao_servicos_alvo_1)}</strong></td>
            <td>${formatCurrency(metas.alvo_2_servicos)}<br><strong>${formatCurrency(metas.premiacao_servicos_alvo_2)}</strong></td>
            <td>${formatCurrency(metas.alvo_3_servicos)}<br><strong>${formatCurrency(metas.premiacao_servicos_alvo_3)}</strong></td>
            <td>${formatCurrency(metas.alvo_4_servicos)}<br><strong>${formatCurrency(metas.premiacao_servicos_alvo_4)}</strong></td>
          </tr>
          <tr class="metas-cdc">
            <td>CDC</td>
            <td>${formatCurrency(metas.alvo_1_cdc)}<br><strong>${formatCurrency(metas.premiacao_cdc_alvo_1)}</strong></td>
            <td>${formatCurrency(metas.alvo_2_cdc)}<br><strong>${formatCurrency(metas.premiacao_cdc_alvo_2)}</strong></td>
            <td>${formatCurrency(metas.alvo_3_cdc)}<br><strong>${formatCurrency(metas.premiacao_cdc_alvo_3)}</strong></td>
            <td>${formatCurrency(metas.alvo_4_cdc)}<br><strong>${formatCurrency(metas.premiacao_cdc_alvo_4)}</strong></td>
          </tr>
          <tr class="metas-estrela">
            <td>Produto Incentivado</td>
            <td>${formatCurrency(metas.alvo_1_produto_incentivado)}<br><strong>${formatCurrency(metas.premiacao_produto_incentivado_alvo_1)}</strong></td>
            <td>${formatCurrency(metas.alvo_2_produto_incentivado)}<br><strong>${formatCurrency(metas.premiacao_produto_incentivado_alvo_2)}</strong></td>
            <td>${formatCurrency(metas.alvo_3_produto_incentivado)}<br><strong>${formatCurrency(metas.premiacao_produto_incentivado_alvo_3)}</strong></td>
            <td>${formatCurrency(metas.alvo_4_produto_incentivado)}<br><strong>${formatCurrency(metas.premiacao_produto_incentivado_alvo_4)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div class="metas-note">
        <strong>Observação:</strong> Multiplicador x2 (valor em
        <code>multiplicador_se_alvo_2_mercantil_cdc_servicos_atingido</code>)
        é aplicado a Mercantil, Serviços e CDC quando o Alvo 2 conjunto é atingido
        para os três tipos.
      </div>
    `;
  }

  function openMetasModal() {
    if (!currentMetas) {
      alert("Metas não disponíveis para esta matrícula / mês.");
      return;
    }
    renderMetasModal(currentMetas);
    document.getElementById("metasModal").style.display = "flex";
  }

  function closeMetasModal() {
    document.getElementById("metasModal").style.display = "none";
  }

  async function buscarExtrato() {
    const matricula = document.getElementById("matriculaInput").value.trim();
    const status = document.getElementById("statusMsg");

    if (!matricula) {
      status.textContent = "Informe a matrícula.";
      status.className = "status-msg error";
      return;
    }

    status.textContent = "Buscando dados...";
    status.className = "status-msg";

    try {
      const [
        respResultados,
        respDetalhes,
        respDetalhesDia,
        respMetas
      ] = await Promise.all([
        fetch(`${apiBase}/api/resultados/${matricula}`),
        fetch(`${apiBase}/api/detalhes/${matricula}`),
        fetch(`${apiBase}/api/detalhesdia/${matricula}`),
        fetch(`${apiBase}/api/metas/${matricula}`)
      ]);

      if (!respResultados.ok) {
        const txt = await respResultados.text();
        throw new Error(txt || respResultados.statusText);
      }

      let detalhesData = null;
      if (respDetalhes.ok) {
        detalhesData = await respDetalhes.json();
      }

      let detalhesDiaData = null;
      if (respDetalhesDia.ok) {
        detalhesDiaData = await respDetalhesDia.json();
      }

      let metasData = null;
      if (respMetas.ok) {
        metasData = await respMetas.json();
      }

      currentMetas = metasData;

      const resultadosData = await respResultados.json();

      status.textContent = "";
      status.className = "status-msg";

      const { fullDate, period } = buildDateFromPartitions(resultadosData);
      const hora = (resultadosData.horario_atualizacao || "").substring(0,5);

      document.getElementById("pageSubtitle").textContent =
        `Período de Comissão: ${period}`;
      document.getElementById("ganhosSubtitle").textContent =
        `Atualizado em ${fullDate} às ${hora} — Filial ${resultadosData.filial}.`;

      renderColaboradorInfo(resultadosData, detalhesData);
      renderResumoDias(detalhesData, detalhesDiaData);
      renderResumoFinanceiro(resultadosData, detalhesDiaData, metasData);
      renderMercantilCard(resultadosData, detalhesDiaData);
      renderProdutoEstrelaCard(resultadosData);
      renderServicosCard(resultadosData, detalhesDiaData);
      renderCdcCard(resultadosData, detalhesDiaData);

    } catch (e) {
      console.error(e);
      status.textContent = "Erro ao buscar dados: " + e.message;
      status.className = "status-msg error";
    }
  }

  document.getElementById("btnBuscar").addEventListener("click", buscarExtrato);
  document.getElementById("btnMesAtual").addEventListener("click", buscarExtrato);
  window.addEventListener("load", buscarExtrato);

  document.getElementById("btnMetasMes").addEventListener("click", openMetasModal);
  document.getElementById("metasModalClose").addEventListener("click", closeMetasModal);
  document.getElementById("metasModal").addEventListener("click", (e) => {
    if (e.target.id === "metasModal") closeMetasModal();
  });