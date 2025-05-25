// URL params
const params     = new URL(location).searchParams;
const tenant     = params.get('t');
const company    = params.get('empresa');
const overlay    = document.getElementById('overlay');
const btnStart   = document.getElementById('btn-start');
const ticketEl   = document.getElementById('ticket');
const statusEl   = document.getElementById('status');
const btnCancel  = document.getElementById('btn-cancel');
const btnSilence = document.getElementById('btn-silence');
const alertSound = document.getElementById('alert-sound');
const compEl     = document.getElementById('company-name');

let clientId, pollId, alertId;

// mostra nome da empresa
if (company && compEl) compEl.textContent = decodeURIComponent(company);

// inicia o fluxo
btnStart.addEventListener('click', async () => {
  try {
    // destrava áudio
    await alertSound.play().catch(()=>{});
    overlay.classList.add('hidden');

    // entra na fila
    console.log('Entrando na fila…');
    const res1 = await fetch(`/.netlify/functions/entrar?t=${tenant}`, { method:'POST' });
    const d1   = await res1.json();
    console.log('Resposta entrar:', d1);

    clientId    = d1.clientId;
    // aceita ambos ticket ou number
    const ticket = d1.ticket ?? d1.number;
    ticketEl.textContent = ticket;
    statusEl.textContent = 'Você entrou na fila';
    btnCancel.disabled = false;
    btnSilence.classList.remove('hidden');

    // começa polling
    startPolling();
  } catch (err) {
    console.error('Erro no start:', err);
    statusEl.textContent = 'Falha ao iniciar. Recarregue a página.';
  }
});

// polling de status
function startPolling() {
  pollId = setInterval(async () => {
    try {
      const res2 = await fetch(`/.netlify/functions/status?t=${tenant}&client=${clientId}`);
      const d2   = await res2.json();
      console.log('Resposta status:', d2);
      if (d2.called) {
        clearInterval(pollId);
        statusEl.textContent = 'É a sua vez!';
        statusEl.classList.add('blink');
        playAlert();
      }
    } catch (err) {
      console.error('Erro no polling:', err);
    }
  }, 2000);
}

// toca o alarme em loop até silenciar
function playAlert() {
  alertId = setInterval(() => {
    if (!alertSound.muted) {
      alertSound.currentTime = 0;
      alertSound.play().catch(()=>{});
    }
  }, 5000);
}

// silenciar alerta
btnSilence.addEventListener('click', () => {
  alertSound.muted = !alertSound.muted;
  btnSilence.classList.toggle('active', alertSound.muted);
});

// cancelar fila
btnCancel.addEventListener('click', async () => {
  clearInterval(pollId);
  clearInterval(alertId);
  btnCancel.disabled = true;
  statusEl.textContent = 'Cancelando…';
  try {
    const res3 = await fetch(`/.netlify/functions/cancelar?t=${tenant}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ clientId })
    });
    console.log('Resposta cancelar:', await res3.json());
    statusEl.textContent = 'Você saiu da fila.';
    ticketEl.textContent = '–';
    statusEl.classList.remove('blink');
  } catch (err) {
    console.error('Erro cancelar:', err);
    statusEl.textContent = 'Falha ao cancelar. Tente novamente.';
    btnCancel.disabled = false;
  }
});
