// public/js/client.js

const TICKET_KEY    = 'sannext_ticket';
const NEEDS_JOIN    = 'sannext_needsJoin';
const CLIENT_ID_KEY = 'sannext_clientId';

const urlParams    = new URL(location).searchParams;
const tenantId     = urlParams.get('t');
const empresaName  = urlParams.get('empresa');

const ticketEl     = document.getElementById('ticket');
const statusEl     = document.getElementById('status');
const waitingEl    = document.getElementById('waiting-count');
const btnSilence   = document.getElementById('btn-silence');
const btnToggle    = document.getElementById('btn-cancel');
const btnStart     = document.getElementById('btn-start');
const overlay      = document.getElementById('overlay');
const alertSound   = document.getElementById('alert-sound');
const companyEl    = document.getElementById('company-name');

let polling, alertInterval, lastEventTs = 0, silenced = false;
let currentTicketNumber = null;

if (empresaName) {
  companyEl.textContent = empresaName;
}

async function fetchNovaSenha() {
  const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
  if (!res.ok) throw new Error('Erro ao obter senha');
  return res.json(); // { clientId, ticketNumber }
}

function mostrarTicket(n) { ticketEl.textContent = n; }
function mostrarStatus(t) { statusEl.textContent = t; }
function mostrarEspera(n) { waitingEl.textContent = `Em espera: ${n}`; }

function clearState() {
  clearInterval(polling);
  clearInterval(alertInterval);
  silenced = true;
  btnSilence.hidden = true;
  mostrarTicket('–');
  mostrarEspera('–');
  btnToggle.classList.replace('cancel','enter');
  btnToggle.textContent = 'Entrar na fila';
  currentTicketNumber = null;
  localStorage.removeItem(TICKET_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
  localStorage.removeItem(NEEDS_JOIN);
  btnToggle.disabled = false;
}

function bootstrap() {
  const ticket = localStorage.getItem(TICKET_KEY);
  const client = localStorage.getItem(CLIENT_ID_KEY);
  if (ticket && client) {
    currentTicketNumber = Number(ticket);
    mostrarTicket(ticket);
    mostrarStatus('Aguardando chamada…');
    btnToggle.classList.replace('enter','cancel');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.disabled = false;
    btnStart.hidden = true;
    overlay.remove();
    polling = setInterval(checkStatus, 2000);
  } else {
    btnToggle.textContent = 'Entrar na fila';
    btnToggle.classList.replace('cancel','enter');
    btnToggle.disabled = true;
    mostrarEspera('–');
  }
}

async function entrarNaFila() {
  btnToggle.disabled = true;
  btnToggle.textContent = 'Aguarde…';
  try {
    const { clientId, ticketNumber } = await fetchNovaSenha();
    currentTicketNumber = ticketNumber;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(TICKET_KEY, ticketNumber);
    localStorage.removeItem(NEEDS_JOIN);

    mostrarTicket(ticketNumber);
    mostrarStatus('Aguardando chamada…');
    btnToggle.classList.replace('enter','cancel');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.disabled = false;
    btnStart.hidden = true;
    overlay.remove();
    polling = setInterval(checkStatus, 2000);
  } catch {
    mostrarStatus('Erro ao entrar. Tente novamente.');
    btnToggle.textContent = 'Entrar na fila';
    btnToggle.disabled = false;
  }
}

async function checkStatus() {
  if (currentTicketNumber === null) return;
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall, ticketCounter, timestamp, attendant } = await res.json();

    // DETECÇÃO DE RESET: se o servidor resetou (ticketCounter < seu número antigo)
    if (ticketCounter < currentTicketNumber) {
      mostrarStatus('Fila resetada. Buscando novo número…');
      clearState();
      // força entrar na fila de novo para pegar o próximo
      return entrarNaFila();
    }

    const waitCount = Math.max(0, currentTicketNumber - currentCall);
    mostrarEspera(waitCount);

    if (currentCall !== currentTicketNumber) {
      mostrarStatus(`Chamando: ${currentCall}`);
    } else {
      mostrarStatus(`É a sua vez! (${attendant})`);
      if (timestamp > lastEventTs) {
        lastEventTs = timestamp;
        silenced = false;
        alertUser();
      }
    }
  } catch {
    // falha silenciosa
  }
}

function alertUser() {
  btnSilence.hidden = false;
  alertSound.currentTime = 0;
  alertSound.play().catch(() => {});
  if (navigator.vibrate) navigator.vibrate([200,100,200]);
  alertInterval = setInterval(() => {
    if (silenced) return;
    alertSound.currentTime = 0;
    alertSound.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
  }, 5000);
}

async function desistirDaFila() {
  btnToggle.disabled = true;
  const clientId     = localStorage.getItem(CLIENT_ID_KEY);
  const ticketNumber = localStorage.getItem(TICKET_KEY);
  if (clientId && ticketNumber) {
    await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ clientId, ticketNumber })
    });
  }
  mostrarStatus('Você saiu da fila.');
  clearState();
}

btnStart.addEventListener('click', () => entrarNaFila());

btnSilence.addEventListener('click', () => {
  silenced = true;
  clearInterval(alertInterval);
  alertSound.pause();
  alertSound.currentTime = 0;
  if (navigator.vibrate) navigator.vibrate(0);
  btnSilence.hidden = true;
});

btnToggle.addEventListener('click', () => {
  const active = currentTicketNumber !== null;
  active ? desistirDaFila() : entrarNaFila();
});

window.addEventListener('offline', () => mostrarStatus('Sem conexão'));
window.addEventListener('online', () => {
  mostrarStatus('Conectado');
  if (localStorage.getItem(NEEDS_JOIN)) entrarNaFila();
});

window.addEventListener('beforeunload', e => {
  if (currentTicketNumber !== null) {
    const msg = 'Se você sair ou atualizar, perderá sua senha atual. Tem certeza?';
    e.returnValue = msg;
    return msg;
  }
});

document.addEventListener('DOMContentLoaded', bootstrap);
