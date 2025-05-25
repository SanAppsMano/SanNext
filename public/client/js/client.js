// public/js/client.js

const STORAGE_TICKET = 'sannext_ticket';
const STORAGE_CLIENT = 'sannext_clientId';

const urlParams   = new URL(location).searchParams;
const tenantId    = urlParams.get('t');

const ticketEl    = document.getElementById('ticket');
const statusEl    = document.getElementById('status');
const waitingEl   = document.getElementById('waiting-count');
const btnSilence  = document.getElementById('btn-silence');
const btnToggle   = document.getElementById('btn-cancel');
const btnStart    = document.getElementById('btn-start');
const overlay     = document.getElementById('overlay');
const alertSound  = document.getElementById('alert-sound');

let polling      = null;
let alertInterval= null;
let lastEventTs  = 0;
let silenced     = false;
let myTicket     = null;

// UI Helpers
function showInitial() {
  clearAllTimers();
  myTicket = null;
  ticketEl.textContent  = '–';
  statusEl.textContent  = 'Toque para entrar na fila';
  waitingEl.textContent = 'Em espera: –';
  overlay.style.display = 'flex';
  btnStart.hidden       = false;
  btnStart.disabled     = false;
  btnToggle.hidden      = true;
  btnSilence.hidden     = true;

  localStorage.removeItem(STORAGE_TICKET);
  localStorage.removeItem(STORAGE_CLIENT);
}

function showWaiting() {
  overlay.style.display = 'none';
  btnStart.hidden       = true;
  btnToggle.hidden      = false;
  btnToggle.textContent = 'Desistir na fila';
  btnToggle.disabled    = false;
  btnSilence.hidden     = true;
}

function clearAllTimers() {
  if (polling) clearInterval(polling);
  if (alertInterval) clearInterval(alertInterval);
  silenced = true;
}

// Fetch de novo ticket
async function enterQueue() {
  btnStart.disabled = true;
  statusEl.textContent = 'Solicitando número…';

  try {
    const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
    if (!res.ok) throw new Error();
    const { clientId, ticketNumber } = await res.json();

    myTicket = Number(ticketNumber);
    localStorage.setItem(STORAGE_CLIENT, clientId);
    localStorage.setItem(STORAGE_TICKET, ticketNumber);

    ticketEl.textContent = ticketNumber;
    statusEl.textContent = 'Aguardando chamada…';
    waitingEl.textContent= 'Em espera: –';
    showWaiting();

    startPolling();
  } catch {
    statusEl.textContent = 'Erro ao entrar. Tente novamente.';
    btnStart.disabled = false;
  }
}

// Polling de status
async function checkStatus() {
  if (myTicket === null) return;
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall, ticketCounter, attendant, timestamp } = await res.json();

    // Se o servidor resetou (menos tickets que o meu), volta ao inicial
    if (ticketCounter < myTicket) {
      showInitial();
      return;
    }

    // Atualiza espera
    const waitCount = Math.max(0, myTicket - currentCall);
    waitingEl.textContent = `Em espera: ${waitCount}`;

    // Atualiza chamada / vez
    if (currentCall !== myTicket) {
      // Remove blink
      ticketEl.classList.remove('blink');
      statusEl.classList.remove('blink');
      statusEl.textContent = `Chamando: ${currentCall}`;
    } else {
      statusEl.textContent = `É a sua vez! (${attendant})`;
      // Adiciona blink
      ticketEl.classList.add('blink');
      statusEl.classList.add('blink');

      if (timestamp > lastEventTs) {
        lastEventTs = timestamp;
        silenced   = false;
        alertUser();
      }
    }
  } catch {
    /* ignora erro */
  }
}

function startPolling() {
  clearAllTimers();
  polling = setInterval(checkStatus, 2000);
}

// Alerta sonoro/vibração
function alertUser() {
  btnSilence.hidden = false;
  alertSound.currentTime = 0;
  alertSound.play().catch(()=>{});
  if (navigator.vibrate) navigator.vibrate([200,100,200]);
  alertInterval = setInterval(() => {
    if (silenced) return;
    alertSound.currentTime = 0;
    alertSound.play().catch(()=>{});
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
  }, 5000);
}

// Cancelar fila
async function cancelQueue() {
  btnToggle.disabled = true;
  const clientId = localStorage.getItem(STORAGE_CLIENT);
  const ticket   = localStorage.getItem(STORAGE_TICKET);
  if (clientId && ticket) {
    await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
      method: 'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ clientId, ticketNumber: ticket })
    });
  }
  showInitial();
}

// Event bindings
btnStart.addEventListener('click', enterQueue);
btnToggle.addEventListener('click', cancelQueue);
btnSilence.addEventListener('click', () => {
  silenced = true;
  clearAllTimers();
});

window.addEventListener('offline', () => statusEl.textContent = 'Sem conexão');
window.addEventListener('online',  () => statusEl.textContent = 'Conectado');
window.addEventListener('beforeunload', e => {
  if (myTicket !== null) {
    e.returnValue = 'Se sair, perderá sua senha. Tem certeza?';
    return e.returnValue;
  }
});

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(STORAGE_TICKET);
  if (saved) {
    myTicket = Number(saved);
    ticketEl.textContent = saved;
    statusEl.textContent = 'Aguardando chamada…';
    waitingEl.textContent= 'Em espera: –';
    showWaiting();
    startPolling();
  } else {
    showInitial();
  }
});
