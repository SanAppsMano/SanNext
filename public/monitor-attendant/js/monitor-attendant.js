// public/js/monitor-attendant.js

/**
 * Script multi-tenant para a tela do atendente:
 * - Onboarding de tenant (empresa + senha) via Redis/Upstash
 * - Autenticação posterior (senha protegida)
 * - Reset de configuração (empresa+senha) no Redis e local
 * - Renderização de QR Code para a fila do cliente
 * - Dropdown manual com tickets disponíveis
 * - Chamadas, repetição, reset de tickets, polling de cancelados
 * - Interação QR: expandir e copiar link, overlay centralizado
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams    = new URL(location).searchParams;
  let token          = urlParams.get('t');
  let empresaParam   = urlParams.get('empresa');
  const storedConfig = localStorage.getItem('monitorConfig');
  let cfg            = storedConfig ? JSON.parse(storedConfig) : null;

  // Se token não veio na URL mas existe em localStorage, usar
  if (!token && cfg && cfg.token) {
    token = cfg.token;
  }

  // Overlays e seções
  const onboardOverlay = document.getElementById('onboard-overlay');
  const loginOverlay   = document.getElementById('login-overlay');
  const headerEl       = document.querySelector('.header');
  const mainEl         = document.querySelector('.main');
  const bodyEl         = document.body;

  // Onboarding
  const onboardLabel    = document.getElementById('onboard-label');
  const onboardPassword = document.getElementById('onboard-password');
  const onboardSubmit   = document.getElementById('onboard-submit');
  const onboardError    = document.getElementById('onboard-error');

  // Botão Redefinir Cadastro
  const btnDeleteConfig = document.getElementById('btn-delete-config');
  btnDeleteConfig.onclick = async () => {
    if (!token) {
      alert('Nenhum monitor ativo para resetar.');
      return;
    }
    if (!confirm('Deseja realmente apagar empresa e senha do servidor?')) return;
    try {
      const res = await fetch(`${location.origin}/.netlify/functions/deleteMonitorConfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        localStorage.removeItem('monitorConfig');
        history.replaceState(null, '', '/monitor-attendant/');
        location.reload();
      } else {
        alert('Erro ao resetar no servidor: ' + (data.error || 'desconhecido'));
      }
    } catch (e) {
      console.error('deleteMonitorConfig falhou:', e);
      alert('Erro de conexão ao servidor.');
    }
  };

  // Elementos de UI principal
  const headerLabel    = document.getElementById('header-label');
  const attendantInput = document.getElementById('attendant-id');
  const currentCallEl  = document.getElementById('current-call');
  const currentIdEl    = document.getElementById('current-id');
  const waitingEl      = document.getElementById('waiting-count');
  const cancelListEl   = document.getElementById('cancel-list');
  const btnNext        = document.getElementById('btn-next');
  const btnRepeat      = document.getElementById('btn-repeat');
  const selectManual   = document.getElementById('manual-select');
  const btnManual      = document.getElementById('btn-manual');
  const btnReset       = document.getElementById('btn-reset');
  const qrContainer    = document.getElementById('qrcode');

  // Cria overlay para QR expandido
  const qrOverlay           = document.createElement('div');
  const qrOverlayContent    = document.createElement('div');
  qrOverlay.id              = 'qrcode-overlay';
  qrOverlayContent.id       = 'qrcode-overlay-content';

  // Estilos inline para garantir centralização
  Object.assign(qrOverlay.style, {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  });
  Object.assign(qrOverlayContent.style, {
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    maxWidth: '90%',
    maxHeight: '90%',
  });
  qrOverlay.appendChild(qrOverlayContent);
  document.body.appendChild(qrOverlay);

  let callCounter   = 0;
  let ticketCounter = 0;
  const fmtTime     = ts => new Date(ts).toLocaleTimeString();

  /** Renderiza o QR Code apontando para /client/ e configura overlay centralizado */
  function renderQRCode(tId) {
    qrContainer.innerHTML        = '';
    qrOverlayContent.innerHTML   = '';

    // Mudança importante: rotas para /client/
    const urlCliente = `${location.origin}/client/?t=${tId}`;

    // QR reduzido
    new QRCode(qrContainer, {
      text: urlCliente,
      width: 128,
      height: 128
    });

    // QR ampliado (overlay)
    new QRCode(qrOverlayContent, {
      text: urlCliente,
      width: 256,
      height: 256
    });

    qrContainer.style.cursor = 'pointer';
    qrContainer.onclick = () => {
      navigator.clipboard.writeText(urlCliente)
        .then(() => {
          qrOverlay.style.display = 'flex';  // mostra overlay centralizado
        });
    };
    qrOverlay.onclick = e => {
      if (e.target === qrOverlay) qrOverlay.style.display = 'none';
    };
  }

  /** Atualiza chamada */
  function updateCall(num, attendantId) {
    callCounter = num;
    currentCallEl.textContent = num > 0 ? num : '–';
    currentIdEl.textContent   = attendantId || '';
  }

  /** Busca status e atualiza UI */
  async function fetchStatus(t) {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${t}`);
      const { currentCall, ticketCounter: tc, attendant } = await res.json();
      updateCall(currentCall, attendant);
      ticketCounter = tc;
      waitingEl.textContent = Math.max(0, ticketCounter - currentCall);
      updateManualOptions();
    } catch (e) {
      console.error(e);
    }
  }

  /** Atualiza opções manuais */
  function updateManualOptions() {
    selectManual.innerHTML = '<option value="">Selecione...</option>';
    for (let i = callCounter + 1; i <= ticketCounter; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      selectManual.appendChild(opt);
    }
    selectManual.disabled = (callCounter + 1 > ticketCounter);
  }

  /** Busca cancelados e popula lista */
  async function fetchCancelled(t) {
    try {
      const res = await fetch(`/.netlify/functions/cancelados?t=${t}`);
      const { cancelled = [] } = await res.json();
      cancelListEl.innerHTML = '';
      cancelled.forEach(({ ticket, ts }) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${ticket}</span><span class="ts">${fmtTime(ts)}</span>`;
        cancelListEl.appendChild(li);
      });
    } catch (e) {
      console.error('Erro ao buscar cancelados:', e);
    }
  }

  /** Inicializa botões e polling */
  function initApp(t) {
    btnNext.onclick = async () => {
      const id = attendantInput.value.trim();
      let url = `/.netlify/functions/chamar?t=${t}`;
      if (id) url += `&id=${encodeURIComponent(id)}`;
      const { called, attendant } = await (await fetch(url)).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnRepeat.onclick = async () => {
      const { called, attendant } = await (await fetch(
        `/.netlify/functions/chamar?t=${t}&num=${callCounter}`
      )).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnManual.onclick = async () => {
      const num = Number(selectManual.value);
      if (!num) return;
      const { called, attendant } = await (await fetch(
        `/.netlify/functions/chamar?t=${t}&num=${num}`
      )).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnReset.onclick = async () => {
      if (!confirm('Confirma resetar todos os tickets para 1?')) return;
      await fetch(`/.netlify/functions/reset?t=${t}`, { method: 'POST' });
      updateCall(0, '');
      fetchCancelled(t);
    };

    renderQRCode(t);
    fetchStatus(t);
    fetchCancelled(t);
    setInterval(() => fetchStatus(t), 5000);
    setInterval(() => fetchCancelled(t), 5000);
  }

  /** Exibe a interface principal após autenticação */
  function showApp(label, tId) {
    onboardOverlay.hidden = true;
    loginOverlay.hidden   = true;
    headerEl.hidden       = false;
    mainEl.hidden         = false;
    bodyEl.classList.add('authenticated');
    headerLabel.textContent = label;
    initApp(tId);
  }

  // ■■■ Fluxo de Autenticação / Onboarding ■■■
  (async () => {
    // 1) Se já temos cfg, pula direto
    if (cfg && cfg.empresa && cfg.senha && token) {
      showApp(cfg.empresa, token);
      return;
    }
    // 2) Se vier token+empresa na URL, pede só senha (igual ao original)...
    if (token && empresaParam) {
      // ... seu código de login permanece
      return;
    }
    // 3) Senão, exibe onboarding
    onboardOverlay.hidden = false;
    loginOverlay.hidden   = true;

    onboardSubmit.onclick = async () => {
      const label = onboardLabel.value.trim();
      const pw    = onboardPassword.value;
      if (!label || !pw) {
        onboardError.textContent = 'Preencha nome e senha.';
        return;
      }
      onboardError.textContent = '';
      try {
        token = crypto.randomUUID().split('-')[0];
        const trialDays = 7;
        const res = await fetch(
          `${location.origin}/.netlify/functions/saveMonitorConfig`,
          {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ token, empresa: label, senha: pw, trialDays })
          }
        );
        const { ok } = await res.json();
        if (!ok) throw new Error();
        cfg = { token, empresa: label, senha: pw };
        localStorage.setItem('monitorConfig', JSON.stringify(cfg));
        history.replaceState(null, '', `/monitor-attendant/?t=${token}&empresa=${encodeURIComponent(label)}`);
        showApp(label, token);
      } catch (e) {
        console.error(e);
        onboardError.textContent = 'Erro ao criar monitor.';
      }
    };
  })();
});
