// public/js/client.js

// ====== Configurações e seletores ======
const TENANT_PARAM   = 't';
const STORAGE_TICKET = 'sannext_ticket';
const STORAGE_CLIENT = 'sannext_clientId';

const urlParams   = new URL(location).searchParams;
const tenantId    = urlParams.get(TENANT_PARAM);

const ticketEl    = document.getElementById('ticket');
const statusEl    = document.getElementById('status');
const waitingEl   = document.getElementById('waiting-count');
const btnSilence  = document.getElementById('btn-silence');
const btnToggle   = document.getElementById('btn-cancel');
const btnStart    = document.getElementById('btn-start');
const overlay     = document.getElementById('overlay');
const alertSound  = document.getElementById('alert-sound');

let polling      = null;
let lastEventTs  = 0;
let silenced     = false;
let myTicket     = null;

// ====== Helpers de UI ======
function showInitial() {
  clearPolling();
  ticketEl.textContent  = '–';
  statusEl.textContent  = 'Toque para entrar na fila';
  waitingEl.textContent = 'Em espera: –';
  overlay.style.display = 'flex';
  btnStart.hidden       = false;
  btnStart.disabled     = false;
  btnToggle.hidden      = true;
  btnSilence.hidden     = true;
}

function showWaiting() {
  overlay.style.display = 'none';
  btnStart.hidden       = true;
  btnToggle.hidden      = false;
  btnToggle.textContent = 'Desistir da fila';
  btnToggle.disabled    = false;
  btnSilence.hidden     = true;
}

function showCalled(attendant) {
  statusEl.textContent = `É a sua vez! (${attendant})`;
}

function clearPolling() {
  if (polling) clearInterval(polling);
  clearInterval(alertInterval);
}

// ====== Fluxos ======
async function enterQueue() {
  btnStart.disabled = true;
  statusEl.textContent = 'Buscando número…';
  try {
    const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
    if (!res.ok) throw new Error();
    const { clientId, ticketNumber } = await res.json();
    myTicket = ticketNumber;
    localStorage.setItem(STORAGE_CLIENT, clientId);
    localStorage.setItem(STORAGE_TICKET, ticketNumber);

    ticketEl.textContent = ticketNumber;
    statusEl.textContent = 'Aguardando chamada…';
    showWaiting();

    startPolling();
  } catch {
    statusEl.textContent = 'Erro ao entrar. Tente novamente.';
    btnStart.disabled = false;
  }
}

async function cancelQueue() {
  btnToggle.disabled = true;
  const clientId = localStorage.getItem(STORAGE_CLIENT);
  const ticket   = localStorage.getItem(STORAGE_TICKET);
  if (clientId && ticket) {
    await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ clientId, ticketNumber: ticket })
    });
  }
  showInitial();
  localStorage.removeItem(STORAGE_CLIENT);
  localStorage.removeItem(STORAGE_TICKET);
}

let alertInterval;
function alertUser() {
  btnSilence.hidden = false;
  alertSound.currentTime = 0;
  alertSound.play().catch(()=>{});
  if (navigator.vibrate) navigator.vibrate([200,100,200]);
  alertInterval = setInterval(()=>{
    if (silenced) return;
    alertSound.currentTime = 0;
    alertSound.play().catch(()=>{});
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
  },5000);
}

async function checkStatus() {
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall, ticketCounter, attendant, timestamp } = await res.json();

    // Detecta reset no servidor
    if (ticketCounter < myTicket) {
      showInitial();
      localStorage.removeItem(STORAGE_CLIENT);
      localStorage.removeItem(STORAGE_TICKET);
      myTicket = null;
      return;
    }

    // Atualiza espera
    const wait = Math.max(0, myTicket - currentCall);
    waitingEl.textContent = `Em espera: ${wait}`;

    // Atualiza chamada / vez
    if (currentCall !== myTicket) {
      statusEl.textContent = `Chamando: ${currentCall}`;
    } else {
      // primeira vez que bate timestamp
      if (timestamp > lastEventTs) {
        lastEventTs = timestamp;
        silenced   = false;
        alertUser();
      }
      showCalled(attendant);
    }
  } catch {
    /* ignora erro de fetch */
  }
}

function startPolling() {
  clearPolling();
  polling = setInterval(checkStatus, 2000);
}

// ====== Binding de eventos ======
btnStart.addEventListener('click', enterQueue);

btnToggle.addEventListener('click', () => {
  if (myTicket !== null) cancelQueue();
});

btnSilence.addEventListener('click', () => {
  silenced = true;
  clearInterval(alertInterval);
  alertSound.pause();
  alertSound.currentTime = 0;
  if (navigator.vibrate) navigator.vibrate(0);
  btnSilence.hidden = true;
});

// Proteção F5
window.addEventListener('beforeunload', e => {
  if (myTicket !== null) {
    e.returnValue = 'Se sair, perderá sua senha. Tem certeza?';
    return e.returnValue;
  }
});

// ====== Inicialização ======
document.addEventListener('DOMContentLoaded', () => {
  // Se já tinha ticket salvo, entra em waiting direto
  const saved = localStorage.getItem(STORAGE_TICKET);
  if (saved) {
    myTicket = Number(saved);
    ticketEl.textContent = saved;
    statusEl.textContent = 'Aguardando chamada…';
    showWaiting();
    startPolling();
  } else {
    showInitial();
  }
});
