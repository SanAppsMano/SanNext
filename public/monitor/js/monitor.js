// public/monitor/js/monitor.js

// Captura o tenantId da URL
const urlParams = new URL(location).searchParams;
const tenantId  = urlParams.get('t');

async function fetchCurrent() {
  try {
    const res = await fetch(`/.netlify/functions/status?t=${tenantId}`);
    const { currentCall } = await res.json();
    document.getElementById('current').textContent =
      currentCall > 0 ? currentCall : '–';
  } catch (e) {
    console.error('Erro ao buscar currentCall:', e);
  }
}

// Polling a cada 2 segundos
fetchCurrent();
setInterval(fetchCurrent, 2000);
