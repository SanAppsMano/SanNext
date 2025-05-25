// public/js/monitor-attendant.js

/**
 * Monitor Atendente: onboarding, login, QR Code, chamadas, cancelados...
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams      = new URL(location).searchParams;
  let token            = urlParams.get('t');
  let empresaParam     = urlParams.get('empresa');
  const storedConfig   = localStorage.getItem('monitorConfig');
  let cfg              = storedConfig ? JSON.parse(storedConfig) : null;

  if (!token && cfg && cfg.token) token = cfg.token;

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

  // Botão “Redefinir Cadastro”
  const btnDeleteConfig = document.getElementById('btn-delete-config');
  btnDeleteConfig.onclick = async () => {
    if (!token) return alert('Nenhum monitor ativo.');
    if (!confirm('Apagar empresa e senha no servidor?')) return;
    try {
      const res = await fetch(`/.netlify/functions/deleteMonitorConfig`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
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
    } catch(e) {
      console.error(e);
      alert('Falha de conexão.');
    }
  };

  // UI principal
  const headerLabel    = document.getElementById('header-label');
  const attendantInput = document.getElementById('attendant-id');
  const currentCallEl  = document.getElementById('current-call');
  const waitingEl      = document.getElementById('waitingCount');  // Corrigido para corresponder ao ID no HTML
  const cancelListEl   = document.getElementById('cancel-list');
  const btnNext        = document.getElementById('btn-next');
  const btnRepeat      = document.getElementById('btn-repeat');
  const selectManual   = document.getElementById('manualSelect'); // Corrigido para corresponder ao ID no HTML
  const btnManual      = document.getElementById('btn-manual');
  const btnReset       = document.getElementById('btn-reset');
  const qrContainer    = document.getElementById('qrcode');

  // Cria overlay para QR ampliado
  const qrOverlay        = document.createElement('div');
  const qrOverlayContent = document.createElement('div');
  qrOverlay.id           = 'qrcode-overlay';
  qrOverlayContent.id    = 'qrcode-overlay-content';
  Object.assign(qrOverlay.style, {
    position:'fixed',top:0,left:0,right:0,bottom:0,
    background:'rgba(0,0,0,0.8)',
    display:'none',alignItems:'center',justifyContent:'center',zIndex:1000
  });
  Object.assign(qrOverlayContent.style, {
    background:'#fff',padding:'1rem',borderRadius:'8px',
    boxShadow:'0 2px 10px rgba(0,0,0,0.3)',maxWidth:'90%',maxHeight:'90%'
  });
  qrOverlay.appendChild(qrOverlayContent);
  document.body.appendChild(qrOverlay);

  let callCounter = 0, ticketCounter = 0;
  const fmtTime   = ts => new Date(ts).toLocaleTimeString();

  /** Renderiza QR apontando para /client/?t=…&empresa=… */
  function renderQRCode(tId) {
    qrContainer.innerHTML = '';
    qrOverlayContent.innerHTML = '';
    const empresa = cfg?.empresa
      ? `&empresa=${encodeURIComponent(cfg.empresa)}`
      : '';
    const urlCliente = `${location.origin}/client/?t=${tId}${empresa}`;

    new QRCode(qrContainer, { text:urlCliente, width:128, height:128 });
    new QRCode(qrOverlayContent, { text:urlCliente, width:256, height:256 });

    qrContainer.style.cursor = 'pointer';
    qrContainer.onclick = () => {
      navigator.clipboard.writeText(urlCliente)
        .then(() => qrOverlay.style.display='flex');
    };
    qrOverlay.onclick = e => {
      if (e.target === qrOverlay) qrOverlay.style.display = 'none';
    };
  }

  function updateCall(num, attendantId) {
    callCounter = num;
    currentCallEl.textContent = num>0?num:'–';
    document.getElementById('current-id').textContent = attendantId||'';
  }

  async function fetchStatus(t) {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${encodeURIComponent(t)}`);
      const { currentCall, ticketCounter:tc, attendant } = await res.json();
      updateCall(currentCall, attendant);
      ticketCounter = tc;
      waitingEl.textContent = Math.max(0, tc - currentCall);
      updateManualOptions();
    } catch(e) {
      console.error('status:', e);
    }
  }

  function updateManualOptions() {
    selectManual.innerHTML = '<option value="">Selecione…</option>';
    for(let i = callCounter + 1; i <= ticketCounter; i++){
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      selectManual.appendChild(opt);
    }
    selectManual.disabled = (callCounter + 1 > ticketCounter);
  }

  async function fetchCancelled(t) {
    try {
      const res = await fetch(`/.netlify/functions/cancelados?t=${encodeURIComponent(t)}`);
      const { cancelled = [] } = await res.json();
      cancelListEl.innerHTML = '';
      cancelled.forEach(({ticket, ts}) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${ticket}</span><span class="ts">${fmtTime(ts)}</span>`;
        cancelListEl.appendChild(li);
      });
    } catch(e){ console.error('cancelados:', e); }
  }

  function initApp(t) {
    btnNext.onclick = async () => {
      const id = attendantInput.value.trim();
      let url = `/.netlify/functions/chamar?t=${encodeURIComponent(t)}`;
      if(id) url += `&id=${encodeURIComponent(id)}`;
      const {called, attendant} = await (await fetch(url)).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnRepeat.onclick = async () => {
      const {called, attendant} = await (await fetch(
        `/.netlify/functions/chamar?t=${encodeURIComponent(t)}&num=${callCounter}`
      )).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnManual.onclick = async () => {
      const num = Number(selectManual.value);
      if(!num) return;
      const {called, attendant} = await (await fetch(
        `/.netlify/functions/chamar?t=${encodeURIComponent(t)}&num=${num}`
      )).json();
      updateCall(called, attendant);
      fetchCancelled(t);
    };
    btnReset.onclick = async () => {
      if(!confirm('Resetar tickets?')) return;
      await fetch(`/.netlify/functions/reset?t=${encodeURIComponent(t)}`,{method:'POST'});
      updateCall(0, '');
      fetchCancelled(t);
    };

    renderQRCode(t);
    fetchStatus(t);
    fetchCancelled(t);
    setInterval(() => fetchStatus(t), 5000);
    setInterval(() => fetchCancelled(t), 5000);
  }

  function showApp(label, tId) {
    onboardOverlay.hidden = true;
    loginOverlay.hidden  = true;
    headerEl.hidden      = false;
    mainEl.hidden        = false;
    bodyEl.classList.add('authenticated');
    headerLabel.textContent = label;
    cfg.empresa = label; // para QR
    initApp(tId);
  }

  ;(async () => {
    if(cfg && cfg.empresa && cfg.senha && token) {
      return showApp(cfg.empresa, token);
    }
    if(token && empresaParam) {
      try {
        const senhaPrompt = prompt(`Senha para ${empresaParam}:`);
        const res = await fetch(`${location.origin}/.netlify/functions/getMonitorConfig`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token, senha: senhaPrompt})
        });
        if(!res.ok) throw new Error();
        const {empresa} = await res.json();
        cfg = {token, empresa, senha: senhaPrompt};
        localStorage.setItem('monitorConfig', JSON.stringify(cfg));
        history.replaceState(null, '', `/monitor-attendant/?t=${token}&empresa=${encodeURIComponent(empresaParam)}`);
        return showApp(empresa, token);
      } catch {
        alert('Token ou senha inválidos.');
        history.replaceState(null, '', '/monitor-attendant/');
      }
    }
    onboardOverlay.hidden = false;
    loginOverlay.hidden  = true;
    onboardSubmit.onclick = async () => {
      const label = onboardLabel.value.trim();
      const pw    = onboardPassword.value;
      if(!label || !pw) {
        onboardError.textContent = 'Preencha nome e senha.';
        return;
      }
      onboardError.textContent = '';
      try {
        token = crypto.randomUUID().split('-')[0];
        const trialDays = 7;
        const res = await fetch(`${location.origin}/.netlify/functions/saveMonitorConfig`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token, empresa: label, senha: pw, trialDays})
        });
        const {ok} = await res.json();
        if(!ok) throw new Error();
        cfg = {token, empresa: label, senha: pw};
        localStorage.setItem('monitorConfig', JSON.stringify(cfg));
        history.replaceState(null, '', `/monitor-attendant/?t=${token}&empresa=${encodeURIComponent(label)}`);
        showApp(label, token);
      } catch(e) {
        console.error(e);
        onboardError.textContent = 'Erro ao criar monitor.';
      }
    };
  })();
});
