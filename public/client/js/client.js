// public/js/client.js

const TICKET_KEY    = 'suaVez_ticket';
const NEEDS_JOIN    = 'suaVez_needsJoin';
const CLIENT_ID_KEY = 'suaVez_clientId';

// URL params
const urlParams  = new URL(location).searchParams;
const tenantId   = urlParams.get('t');

// Elementos
const ticketEl    = document.getElementById('ticket');
const statusEl    = document.getElementById('status');
const btnSilence  = document.getElementById('btn-silence');
const btnToggle   = document.getElementById('btn-cancel');
const btnStart    = document.getElementById('btn-start');
const overlay     = document.getElementById('overlay');
const alertSound  = document.getElementById('alert-sound');

let polling, alertInterval, lastEventTs = 0, silenced = false;

// Fetch de nova senha
async function fetchNovaSenha() {
  const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
  if (!res.ok) throw new Error('Erro ao obter senha');
  return res.json(); // { clientId, ticketNumber }
}

// Mostrar ticket e status
function mostrarTicket(n) { ticketEl.textContent = n; }
function mostrarStatus(t) { statusEl.textContent = t; }

// Bootstrap inicial: reativa estado se já houver ticket
function bootstrap() {
  const ticket = localStorage.getItem(TICKET_KEY);
  const client = localStorage.getItem(CLIENT_ID_KEY);
  if (ticket && client) {
    mostrarTicket(ticket);
    mostrarStatus('Aguardando chamada...');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.disabled = false;
    btnStart.hidden = true;
    overlay.remove();
    polling = setInterval(checkStatus, 2000);
  }
}

// Entrar na fila
async function entrarNaFila() {
  btnToggle.disabled = true;
  localStorage.removeItem(TICKET_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
  localStorage.setItem(NEEDS_JOIN, 'true');

  try {
    const { clientId, ticketNumber } = await fetchNovaSenha();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(TICKET_KEY, ticketNumber);
    localStorage.removeItem(NEEDS_JOIN);

    mostrarTicket(ticketNumber);
    mostrarStatus('Aguardando chamada...');
    btnToggle.textContent = 'Desistir da fila';
    btnToggle.disabled = false;
    btnStart.hidden = true;
    overlay.remove();
    polling = setInterval(checkStatus, 2000);
  } catch {
    // manter NEEDS_JOIN para retry ao reconectar
  }
}

// Checar status de chamada
async function checkStatus() {
  const ticket = localStorage.getItem(TICKET_KEY);
  if (!ticket) return;
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall, timestamp, attendant } = await res.json();

    if (currentCall !== Number(ticket)) {
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
    // ignorar falhas temporárias
  }
}

// Dispara alertas sonoro e vibratório
function alertUser() {
  btnSilence.hidden = false;
  const doAlert = () => {
    if (silenced) return;
    alertSound.currentTime = 0;
    alertSound.play().catch(()=>{});
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
  };
  doAlert();
  alertInterval = setInterval(doAlert, 5000);
}

// Desistir da fila ou toggle para entrar
async function desistirDaFila() {
  btnToggle.disabled = true;
  const clientId    = localStorage.getItem(CLIENT_ID_KEY);
  const ticketNumber= localStorage.getItem(TICKET_KEY);

  if (clientId && ticketNumber) {
    await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ clientId, ticketNumber })
    });
  }

  clearInterval(polling);
  clearInterval(alertInterval);
  silenced = true;
  btnSilence.hidden = true;

  mostrarStatus('Você saiu da fila.');
  mostrarTicket('–');

  localStorage.removeItem(TICKET_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
  localStorage.removeItem(NEEDS_JOIN);

  btnToggle.textContent = 'Entrar na fila';
  btnToggle.disabled = false;
}

// Evento de start (overlay)
btnStart.addEventListener('click', () => entrarNaFila());

// Silenciar alerta
btnSilence.addEventListener('click', () => {
  silenced = true;
  clearInterval(alertInterval);
  btnSilence.hidden = true;
});

// Toggle Enter/Cancel
btnToggle.addEventListener('click', () => {
  const has = !!localStorage.getItem(TICKET_KEY);
  has ? desistirDaFila() : entrarNaFila();
});

// Network status
window.addEventListener('offline', () => mostrarStatus('Sem conexão'));
window.addEventListener('online', () => {
  mostrarStatus('Conectado');
  if (localStorage.getItem(NEEDS_JOIN)) entrarNaFila();
});

// Confirmação antes de F5
window.addEventListener('beforeunload', e => {
  if (localStorage.getItem(TICKET_KEY)) {
    const msg = 'Se você sair ou atualizar, perderá sua senha atual. Tem certeza?';
    e.returnValue = msg;
    return msg;
  }
});

// Inicia
document.addEventListener('DOMContentLoaded', bootstrap);
