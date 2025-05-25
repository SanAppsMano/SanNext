// public/js/monitor-attendant.js

/**
 * Monitor Atendente:
 * - Onboarding / login
 * - Gerenciamento de fila (chamar / repetir / manual / reset)
 * - Exibição de QR Code (incluindo empresa)
 * - Listagem de cancelados
 * - Contador “Em espera”
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams     = new URL(location).searchParams;
  let token           = urlParams.get('t');
  let empresaParam    = urlParams.get('empresa');
  const storedConfig  = localStorage.getItem('monitorConfig');
  let cfg             = storedConfig ? JSON.parse(storedConfig) : {};

  if (!token && cfg.token) {
    token = cfg.token;
  }

  // Elementos de UI
  const onboardOverlay = document.getElementById('onboard-overlay');
  const loginOverlay   = document.getElementById('login-overlay');
  const headerEl       = document.querySelector('.header');
  const mainEl         = document.querySelector('.main');
  const headerLabel    = document.getElementById('header-label');

  const attendantInput = document.getElementById('attendant-id');
  const currentCallEl  = document.getElementById('current-call');
  const currentIdEl    = document.getElementById('current-id');
  const waitingEl      = document.getElementById('waiting-count');      // <--- NOVO
  const cancelListEl   = document.getElementById('cancel-list');

  const btnNext        = document.getElementById('btn-next');
  const btnRepeat      = document.getElementById('btn-repeat');
  const selectManual   = document.getElementById('manual-select');
  const btnManual      = document.getElementById('btn-manual');
  const btnReset       = document.getElementById('btn-reset');
  const btnDeleteConfig = document.getElementById('btn-delete-config');

  // QR Code
  const qrContainer    = document.getElementById('qrcode');
  const qrOverlay      = document.createElement('div');
  const qrOverlayContent = document.createElement('div');
  qrOverlay.id         = 'qrcode-overlay';
  qrOverlayContent.id  = 'qrcode-overlay-content';
  Object.assign(qrOverlay.style, {
    position:'fixed',top:0,left:0,right:0,bottom:0,
    background:'rgba(0,0,0,0.8)', display:'none',
    alignItems:'center',justifyContent:'center',zIndex:1000
  });
  Object.assign(qrOverlayContent.style, {
    background:'#fff', padding:'1rem', borderRadius:'8px',
    boxShadow:'0 2px 10px rgba(0,0,0,0.3)',
    maxWidth:'90%', maxHeight:'90%'
  });
  qrOverlay.appendChild(qrOverlayContent);
  document.body.appendChild(qrOverlay);

  let callCounter   = 0;
  let ticketCounter = 0;
  const fmtTime     = ts => new Date(ts).toLocaleTimeString();

  // Onboarding / Login Reset
  btnDeleteConfig.onclick = async () => {
    if (!token) return alert('Nenhum monitor ativo.');
    if (!confirm('Deseja apagar empresa e senha?')) return;
    try {
      const res = await fetch(`/.netlify/functions/deleteMonitorConfig`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        localStorage.removeItem('monitorConfig');
        history.replaceState(null,'','/monitor-attendant/');
        location.reload();
      } else {
        alert('Erro: ' + (data.error||'desconhecido'));
      }
    } catch (e) {
      console.error(e);
      alert('Falha de conexão.');
    }
  };

  /** Gera QR Code incluindo parâmetro &empresa= */
  function renderQRCode(tId) {
    qrContainer.innerHTML      = '';
    qrOverlayContent.innerHTML = '';
    const empresa = cfg.empresa
      ? `&empresa=${encodeURIComponent(cfg.empresa)}`
      : '';
    const urlCliente = `${location.origin}/client/?t=${tId}${empresa}`;

    new QRCode(qrContainer,      { text: urlCliente, width:128, height:128 });
    new QRCode(qrOverlayContent, { text: urlCliente, width:256, height:256 });

    qrContainer.style.cursor = 'pointer';
    qrContainer.onclick = () => {
      navigator.clipboard.writeText(urlCliente)
        .then(() => qrOverlay.style.display = 'flex');
    };
    qrOverlay.onclick = e => {
      if (e.target === qrOverlay) qrOverlay.style.display = 'none';
    };
  }

  /** Atualiza chamada e contador “Em espera” */
  async function fetchStatus(t) {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${t}`);
      const data = await res.json();
      const currentCall = Number(data.currentCall);
      const attendant   = data.attendant;
      const tc          = Number(data.ticketCounter);

      callCounter   = currentCall;
      ticketCounter = tc;

      // Exibe chamado atual
      currentCallEl.textContent = currentCall > 0 ? currentCall : '–';
      currentIdEl.textContent   = attendant || '';

      // Calcula e exibe “Em espera”
      const waiting = Math.max(0, ticketCounter - callCounter);
      waitingEl.textContent = waiting;

      // Atualiza dropdown manual
      selectManual.innerHTML = '<option value="">Selecione…</option>';
      for (let i = callCounter + 1; i <= ticketCounter; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        selectManual.appendChild(opt);
      }
      selectManual.disabled = (callCounter + 1 > ticketCounter);

    } catch (e) {
      console.error('Erro em status:', e);
    }
  }

  /** Busca e exibe lista de cancelados */
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
      console.error('Erro cancelados:', e);
    }
  }

  /** Inicializa botões e polling */
  function initApp(t) {
    btnNext.onclick = async () => {
      const id = attendantInput.value.trim();
      let url = `/.netlify/functions/chamar?t=${t}`;
      if (id) url += `&id=${encodeURIComponent(id)}`;
      await fetch(url).then(r => r.json());
      await fetchStatus(t);
      fetchCancelled(t);
    };

    btnRepeat.onclick = async () => {
      const url = `/.netlify/functions/chamar?t=${t}&num=${callCounter}`;
      await fetch(url).then(r => r.json());
      await fetchStatus(t);
      fetchCancelled(t);
    };

    btnManual.onclick = async () => {
      const num = Number(selectManual.value);
      if (!num) return;
      const url = `/.netlify/functions/chamar?t=${t}&num=${num}`;
      await fetch(url).then(r => r.json());
      await fetchStatus(t);
      fetchCancelled(t);
    };

    btnReset.onclick = async () => {
      if (!confirm('Confirmar reset de tickets?')) return;
      await fetch(`/.netlify/functions/reset?t=${t}`, { method:'POST' });
      currentCallEl.textContent = '–';
      waitingEl.textContent     = '–';
      fetchStatus(t);
      fetchCancelled(t);
    };

    renderQRCode(t);
    fetchStatus(t);
    fetchCancelled(t);
    setInterval(() => fetchStatus(t), 5000);
    setInterval(() => fetchCancelled(t), 5000);
  }

  /** Exibe interface principal */
  function showApp(label, tId) {
    onboardOverlay.hidden = true;
    loginOverlay.hidden   = true;
    headerEl.hidden       = false;
    mainEl.hidden         = false;
    headerLabel.textContent = label;
    cfg.empresa = label; // garante empresa no QR
    localStorage.setItem('monitorConfig', JSON.stringify(cfg));
    initApp(tId);
  }

  // ■■■ Fluxo de Onboarding / Login ■■■
  (async () => {
    if (cfg.empresa && cfg.senha && token) {
      return showApp(cfg.empresa, token);
    }
    if (token && empresaParam) {
      try {
        const pw = prompt(`Senha para ${empresaParam}:`);
        const res = await fetch(`/.netlify/functions/getMonitorConfig`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token, senha: pw })
        });
        if (!res.ok) throw new Error();
        const { empresa } = await res.json();
        cfg = { token, empresa, senha: pw };
        history.replaceState(null, '', `/monitor-attendant/?t=${token}&empresa=${encodeURIComponent(empresa)}`);
        return showApp(empresa, token);
      } catch {
        alert('Token ou senha inválidos.');
        history.replaceState(null, '', '/monitor-attendant/');
      }
    }
    onboardOverlay.hidden = false;
    loginOverlay.hidden   = true;
    document.getElementById('onboard-submit').onclick = async () => {
      const label = document.getElementById('onboard-label').value.trim();
      const pw    = document.getElementById('onboard-password').value;
      if (!label || !pw) {
        document.getElementById('onboard-error').textContent = 'Preencha nome e senha.';
        return;
      }
      try {
        token = crypto.randomUUID().split('-')[0];
        const res = await fetch(`/.netlify/functions/saveMonitorConfig`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token, empresa: label, senha: pw, trialDays: 7 })
        });
        const { ok } = await res.json();
        if (!ok) throw new Error();
        cfg = { token, empresa: label, senha: pw };
        showApp(label, token);
      } catch (e) {
        console.error(e);
        document.getElementById('onboard-error').textContent = 'Erro ao criar monitor.';
      }
    };
  })();
});
