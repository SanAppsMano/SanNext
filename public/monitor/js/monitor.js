
// public/monitor/js/monitor.js
const alertSound   = document.getElementById('alert-sound');
const enableAlerts = document.getElementById('enable-alerts');
let lastCall;
let audioCtx;

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.stop(audioCtx.currentTime + 0.5);
  } catch(e) {
    console.error('playBeep', e);
  }
}

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
      const audioPromise = alertSound.play().catch(() => { playBeep(); });
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(`É a sua vez: ${currentCall} ${name || ''}`);
        utter.lang = 'pt-BR';
        if (audioPromise instanceof Promise) audioPromise.finally(() => speechSynthesis.speak(utter));
        else speechSynthesis.speak(utter);
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
