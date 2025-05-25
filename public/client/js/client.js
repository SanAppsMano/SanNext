// public/client/js/client.js

// Captura params da URL
const urlParams   = new URL(location).searchParams;
const tenantId    = urlParams.get("t");
const empresa     = urlParams.get("empresa") || null;

// Elementos do DOM
const ticketEl    = document.getElementById("ticket");
const statusEl    = document.getElementById("status");
const btnCancel   = document.getElementById("btn-cancel");
const btnSilence  = document.getElementById("btn-silence");
const btnStart    = document.getElementById("btn-start");
const overlay     = document.getElementById("overlay");
const alertSound  = document.getElementById("alert-sound");
const companyEl   = document.getElementById("company-name");

let clientId, ticketNumber;
let pollingInterval, alertInterval;

// Exibe nome da empresa (se fornecido)
if (empresa && companyEl) {
  companyEl.textContent = decodeURIComponent(empresa);
}

// Primeiro clique: destrava áudio/vibração/notificações e entra na fila
btnStart.addEventListener("click", async () => {
  // destrava o áudio
  alertSound.play().catch(()=>{});
  overlay.classList.add("hidden");

  try {
    // 1) Entra na fila e pega ticket + clientId
    const joinRes = await fetch(`/.netlify/functions/entrar?t=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const joinData = await joinRes.json();
    clientId      = joinData.clientId;
    ticketNumber  = joinData.ticket;

    // 2) Exibe no UI
    ticketEl.textContent = ticketNumber;
    statusEl.textContent = "Você entrou na fila";
    btnCancel.disabled   = false;

    // 3) Inicia polling de status
    startPolling();
  } catch (err) {
    console.error("Erro ao entrar na fila:", err);
    statusEl.textContent = "Falha ao entrar na fila. Tente novamente.";
  }
});

// Função de polling para verificar se foi chamado
function startPolling() {
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${tenantId}&client=${clientId}`);
      const data = await res.json();
      if (data.called && !alertInterval) {
        // 4) Foi chamado: alerta e animação
        statusEl.textContent = "É a sua vez!";
        statusEl.classList.add("blink");
        playAlertLoop();
      }
    } catch (err) {
      console.error("Erro no polling:", err);
    }
  }, 2000);
}

// Loop de alerta sonoro
function playAlertLoop() {
  alertInterval = setInterval(() => {
    if (!alertSound.muted) {
      alertSound.currentTime = 0;
      alertSound.play().catch(()=>{});
    }
  }, 5000);
}

// Toggle silenciar
btnSilence.addEventListener("click", () => {
  alertSound.muted = !alertSound.muted;
  btnSilence.classList.toggle("active", alertSound.muted);
});

// Desistir da fila
btnCancel.addEventListener("click", async () => {
  btnCancel.disabled = true;
  statusEl.textContent = "Cancelando…";
  clearInterval(alertInterval);
  clearInterval(pollingInterval);

  try {
    await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId })
    });
    statusEl.textContent = "Você saiu da fila.";
    ticketEl.textContent = "–";
    statusEl.classList.remove("blink");
  } catch (err) {
    console.error("Erro ao cancelar:", err);
    statusEl.textContent = "Falha ao cancelar. Tente novamente.";
    btnCancel.disabled = false;
  }
});
