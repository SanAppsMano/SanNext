// public/js/client.js

const TICKET_KEY    = 'sannext_ticket';
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

// Se veio empresa via QR, exibe
if (empresaName) {
  companyEl.textContent = empresaName;
}

// Fetch do próximo ticket no servidor
async function fetchNovaSenha() {
  const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
  if (!res.ok) throw new Error('Erro ao obter senha');
  return res.json(); // { clientId, ticketNumber }
}

// Atualiza UI
function mostrarTicket(n) { ticketEl.textContent = n; }
function mostrarStatus(t) { statusEl.textContent = t; }
function mostrarEspera(n) { waitingEl.textContent = `Em espera: ${n}`; }

// Limpa estado local e UI (sem recarregar nem overlay)
function clearLocalState() {
  clearInterval(polling);
  clearInterval(alertInterval);
  silenced = true;
  btnSilence.hidden = true;

  localStorage.removeItem(TICKET_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);

  currentTicketNumber = null;
  mostrarTicket('–');
  mostrarEspera('–');
}

// Inicializa o app a partir do localStorage
function bootstrap() {
  const ticket = localStorage.getItem(TICKET_KEY);
  const client = localStorage.getItem(CLIENT_ID_KEY);
  if (ticket && client) {
    currentTicketNumber = Number(ticket);
    mostrarTicket(ticket);
    mostrarStatus('Aguardando chamada…');
    mostrarEspera('–');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.classList.replace('enter','cancel');
    btnToggle.disabled = false;
    btnToggle.hidden = false;
    overlay.style.display = 'none';
    polling = setInterval(checkStatus, 2000);
  } else {
    mostrarTicket('–');
    mostrarEspera('–');
    mostrarStatus('Toque para entrar na fila');
    btnToggle.hidden   = true;
    btnStart.hidden    = false;
    btnStart.disabled  = false;
  }
}

// Fluxo de entrar na fila (busca do servidor)
async function entrarNaFila() {
  btnStart.disabled = true;
  mostrarStatus('Solicitando número…');
  try {
    const { clientId, ticketNumber } = await fetchNovaSenha();
    currentTicketNumber = ticketNumber;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(TICKET_KEY, ticketNumber);

    mostrarTicket(ticketNumber);
    mostrarStatus('Aguardando chamada…');
    mostrarEspera('–');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.classList.replace('enter','cancel');
    btnToggle.disabled = false;
    btnToggle.hidden   = false;
    btnSilence.hidden  = true;
    overlay.style.display = 'none';

    polling = setInterval(checkStatus, 2000);
  } catch {
    mostrarStatus('Erro ao entrar. Tente novamente.');
    btnStart.disabled = false;
  }
}

// Verifica status e detecta reset
async function checkStatus() {
  if (currentTicketNumber === null) return;
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall, ticketCounter, timestamp, attendant } = await res.json();

    // 1) Detecta reset no servidor
    if (ticketCounter < currentTicketNumber) {
      // limpa local e já faz nova entrada automática
      clearLocalState();
      return entrarNaFila();
    }

    // 2) Atualiza “Em espera”
    const waitCount = Math.max(0, currentTicketNumber - currentCall);
    mostrarEspera(waitCount);

    // 3) Atualiza status de chamada
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

// Alerta sonoro e vibratório
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

// Desistir da fila
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
  clearLocalState();
  mostrarStatus('Você saiu da fila. Toque para entrar novamente.');
}

// Eventos
btnStart.addEventListener('click', entrarNaFila);
btnToggle.addEventListener('click', () => { if (currentTicketNumber) desistirDaFila() });
btnSilence.addEventListener('click', () => {
  silenced = true;
  clearInterval(alertInterval);
  alertSound.pause();
  alertSound.currentTime = 0;
  if (navigator.vibrate) navigator.vibrate(0);
  btnSilence.hidden = true;
});

window.addEventListener('offline', () => mostrarStatus('Sem conexão'));
window.addEventListener('online',  () => mostrarStatus('Conectado'));

window.addEventListener('beforeunload', e => {
  if (currentTicketNumber !== null) {
    const msg = 'Se você sair ou atualizar, perderá sua senha atual. Tem certeza?';
    e.returnValue = msg;
    return msg;
  }
});

document.addEventListener('DOMContentLoaded', bootstrap);
