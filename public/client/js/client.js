// URL params
const params    = new URL(location).searchParams;
const tenant    = params.get('t');
const company   = params.get('empresa');
const overlay   = document.getElementById('overlay');
const btnStart  = document.getElementById('btn-start');
const ticketEl  = document.getElementById('ticket');
const statusEl  = document.getElementById('status');
const btnCancel = document.getElementById('btn-cancel');
const btnSilence= document.getElementById('btn-silence');
const alertSound= document.getElementById('alert-sound');
const compEl    = document.getElementById('company-name');

let clientId, ticket, pollId, alertId;

// exibe empresa
if (company && compEl) compEl.textContent = decodeURIComponent(company);

// inicia tudo
btnStart.addEventListener('click', async () => {
  alertSound.play().catch(() => {});
  overlay.classList.add('hidden');
  try {
    const res = await fetch(`/.netlify/functions/entrar?t=${tenant}`, { method: 'POST' });
    const data= await res.json();
    clientId = data.clientId;
    ticket   = data.ticket;
    ticketEl.textContent = ticket;
    statusEl.textContent = 'Você entrou na fila';
    btnCancel.disabled = false;
    btnSilence.classList.remove('hidden');
    startPolling();
  } catch {
    statusEl.textContent = 'Erro ao entrar. Tente novamente.';
  }
});

// polling
function startPolling() {
  pollId = setInterval(async () => {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${tenant}&client=${clientId}`);
      const st  = await res.json();
      if (st.called) {
        clearInterval(pollId);
        statusEl.textContent = 'É a sua vez!';
        statusEl.classList.add('blink');
        playAlert();
      }
    } catch {}
  }, 2000);
}

// alerta em loop
function playAlert() {
  alertId = setInterval(() => {
    if (!alertSound.muted) {
      alertSound.currentTime = 0;
      alertSound.play().catch(() => {});
    }
  }, 5000);
}

// silenciar
btnSilence.addEventListener('click', () => {
  alertSound.muted = !alertSound.muted;
  btnSilence.classList.toggle('active', alertSound.muted);
});

// cancelar fila
btnCancel.addEventListener('click', async () => {
  clearInterval(pollId);
  clearInterval(alertId);
  btnCancel.disabled = true;
  statusEl.textContent = 'Cancelando...';
  try {
    await fetch(`/.netlify/functions/cancelar?t=${tenant}`, {
      method: 'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ clientId })
    });
    statusEl.textContent = 'Você saiu da fila.';
    ticketEl.textContent = '–';
  } catch {
    statusEl.textContent = 'Erro ao cancelar. Tente novamente.';
    btnCancel.disabled = false;
  }
});
