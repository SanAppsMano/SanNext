
// public/monitor/js/monitor.js
const alertSound   = document.getElementById('alert-sound');
const enableAlerts = document.getElementById('enable-alerts');
let lastCall;

// restaura preferencia
enableAlerts.checked = localStorage.getItem('monitorAlerts') === 'on';
enableAlerts.addEventListener('change', () => {
  localStorage.setItem('monitorAlerts', enableAlerts.checked ? 'on' : 'off');
});

async function fetchCurrent() {
  try {
    const res = await fetch('/.netlify/functions/status');
    const { currentCall, names = {} } = await res.json();
    const currentEl = document.getElementById('current');
    const nameEl = document.getElementById('current-name');
    const name = names[currentCall];
    currentEl.textContent = currentCall;
    if (name) {
      currentEl.classList.add('manual');
      nameEl.textContent = name;
    } else {
      currentEl.classList.remove('manual');
      nameEl.textContent = '';
    }

    if (lastCall !== undefined && currentCall !== lastCall && enableAlerts.checked) {
      alertSound.currentTime = 0;
      alertSound.play().catch(() => {});
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(`É a sua vez: ${currentCall} ${name || ''}`);
        utter.lang = 'pt-BR';
        speechSynthesis.speak(utter);
      }
    }
    lastCall = currentCall;
  } catch (e) {
    console.error('Erro ao buscar currentCall:', e);
  }
}

// Polling a cada 2 segundos
fetchCurrent();
setInterval(fetchCurrent, 2000);
