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

let clientId, ticketNumber, polling, alertInterval;

// Exibe nome da empresa (se fornecido)
if (empresa && companyEl) {
  companyEl.textContent = decodeURIComponent(empresa);
}

// Primeiro clique: destrava áudio/vibração/notificações
btnStart.addEventListener("click", () => {
  alertSound.play().catch(()=>{}); // apenas para destravar áudio
  overlay.classList.add("hidden");
  initQueue(); // inicia conexões
});

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
  clearInterval(polling);

  await fetch(`/.netlify/functions/cancelar?t=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });

  statusEl.textContent = "Você saiu da fila.";
  ticketEl.textContent  = "–";
  statusEl.classList.remove("blink");
});

// Função principal: conecta ao servidor e fica de olho no seu número
function initQueue() {
  // exemplo de subscribe via WebSocket ou polling...
  // você pode manter aqui seu código original de subscribe/polling
  // quando receber { ticket, clientId }, faça:
  //   clientId    = data.clientId;
  //   ticketNumber= data.ticket;
  //   ticketEl.textContent = ticketNumber;
  //   btnCancel.disabled = false;
  //
  // e quando alguém chamar você:
  //   statusEl.textContent = "É a sua vez!";
  //   statusEl.classList.add("blink");
  //   tocarAlerta();
  //
  // abaixo um pseudocódigo de polling:

  polling = setInterval(async () => {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}&client=${clientId}`);
    const data = await res.json();
    if (data.called && !alertInterval) {
      statusEl.textContent = "É a sua vez!";
      statusEl.classList.add("blink");
      tocarAlerta();
    }
  }, 2000);
}

// Dispara alerta sonoro em loop até silenciar
function tocarAlerta() {
  alertInterval = setInterval(() => {
    if (!alertSound.muted) {
      alertSound.currentTime = 0;
      alertSound.play().catch(()=>{});
    }
  }, 5000);
}
