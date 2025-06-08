// public/client/js/client.js

// Captura o tenantId da URL
const urlParams = new URL(location).searchParams;
const tenantId  = urlParams.get("t");

// Chave pública VAPID para push notifications (injetada via HTML/env)
const VAPID_PUBLIC_KEY = window.VAPID_PUBLIC_KEY || "";

// Registra o service worker para notificações push
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// pega também o nome da empresa
const empresa = urlParams.get("empresa");
if (empresa) {
  // cria o header se ainda não existir
  const companyEl = document.getElementById("company-name");
  if (companyEl) companyEl.textContent = decodeURIComponent(empresa);
}


// elementos
const ticketEl   = document.getElementById("ticket");
const statusEl   = document.getElementById("status");
const btnCancel  = document.getElementById("btn-cancel");
const btnSilence = document.getElementById("btn-silence");
const btnStart   = document.getElementById("btn-start");
const overlay    = document.getElementById("overlay");
const alertSound = document.getElementById("alert-sound");

let clientId, ticketNumber;
let polling, alertInterval;
let lastEventTs = 0;
let silenced   = false;

// AVISO AO RECARREGAR/FECHAR A PÁGINA
window.addEventListener('beforeunload', function (e) {
  // só perguntar se tiver um ticket válido e sem ter saído
  if (ticketNumber && statusEl.textContent !== "Você saiu da fila.") {
    const confirmationMessage = "Ao atualizar ou fechar a página você perderá seu número na fila. Deseja continuar?";
    e.preventDefault();
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});

btnStart.addEventListener("click", () => {
  // som/vibração de teste
  alertSound.play().then(() => alertSound.pause()).catch(()=>{});
  if (navigator.vibrate) navigator.vibrate(1);
  let permPromise = Promise.resolve();
  if ("Notification" in window) permPromise = Notification.requestPermission();
  overlay.remove();
  btnCancel.disabled = false;
  permPromise.then(subscribePush);
  getTicket();
  polling = setInterval(checkStatus, 2000);
});

async function subscribePush() {
  if (!("serviceWorker" in navigator) || !VAPID_PUBLIC_KEY) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY
    });
    await fetch(`/.netlify/functions/saveSubscription?t=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, subscription })
    });
  } catch (e) {
    console.error("subscribePush", e);
  }
}

async function getTicket() {
  const res = await fetch(`/.netlify/functions/entrar?t=${tenantId}`);
  const data = await res.json();
  clientId     = data.clientId;
  ticketNumber = data.ticketNumber;
  ticketEl.textContent  = ticketNumber;
  statusEl.textContent  = "Aguardando chamada...";
}

async function checkStatus() {
  if (!ticketNumber) return;
  const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
  const { currentCall, timestamp, attendant } = await res.json();

  if (currentCall !== ticketNumber) {
    statusEl.textContent = `Chamando: ${currentCall} (${attendant})`;
    btnCancel.disabled = false;
    statusEl.classList.remove("blink");
    return;
  }

  statusEl.textContent = `É a sua vez! (Atendente: ${attendant})`;
  statusEl.classList.add("blink");
  btnCancel.disabled = true;

  if (timestamp > lastEventTs) {
    silenced    = false;
    lastEventTs = timestamp;
    alertUser();
  }
}

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

btnSilence.addEventListener("click", () => {
  silenced = true;
  clearInterval(alertInterval);
  alertSound.pause();
  alertSound.currentTime = 0;
  if (navigator.vibrate) navigator.vibrate(0);
  btnSilence.hidden = true;
});

btnCancel.addEventListener("click", async () => {
  btnCancel.disabled = true;
  statusEl.textContent = "Cancelando...";
  clearInterval(alertInterval);

  await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });

  clearInterval(polling);
  statusEl.textContent = "Você saiu da fila.";
  ticketEl.textContent = "–";
  statusEl.classList.remove("blink");
});
