// public/js/monitor-attendant.js

document.addEventListener('DOMContentLoaded', () => {
  const urlParams      = new URL(location).searchParams
  let token            = urlParams.get('t')
  let empresaParam     = urlParams.get('empresa')
  const storedConfig   = localStorage.getItem('monitorConfig')
  let cfg              = storedConfig ? JSON.parse(storedConfig) : null

  // Usa token do storage se não vier na URL
  if (!token && cfg && cfg.token) token = cfg.token

  // Overlays e seções
  const onboardOverlay = document.getElementById('onboard-overlay')
  const loginOverlay   = document.getElementById('login-overlay')
  const headerEl       = document.querySelector('.header')
  const mainEl         = document.querySelector('.main')
  const bodyEl         = document.body

  // Onboarding
  const onboardLabel    = document.getElementById('onboard-label')
  const onboardPassword = document.getElementById('onboard-password')
  const onboardSubmit   = document.getElementById('onboard-submit')
  const onboardError    = document.getElementById('onboard-error')

  // Redefinir
  const btnDeleteConfig = document.getElementById('btn-delete-config')
  btnDeleteConfig.onclick = async () => {
    if (!token) return alert('Nenhum monitor ativo.')
    if (!confirm('Deseja apagar empresa e senha?')) return
    try {
      const res = await fetch(`/.netlify/functions/deleteMonitorConfig`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token })
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        localStorage.removeItem('monitorConfig')
        history.replaceState(null, '', '/monitor-attendant/')
        location.reload()
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao resetar no servidor.')
    }
  }

  // UI principal
  const headerLabel   = document.getElementById('header-label')
  const attendantInput= document.getElementById('attendant-id')
  const currentCallEl = document.getElementById('current-call')
  const waitingEl     = document.getElementById('waiting-count')
  const cancelListEl  = document.getElementById('cancel-list')
  const btnNext       = document.getElementById('btn-next')
  const btnRepeat     = document.getElementById('btn-repeat')
  const selectManual  = document.getElementById('manual-select')
  const btnManual     = document.getElementById('btn-manual')
  const btnReset      = document.getElementById('btn-reset')
  const qrContainer   = document.getElementById('qrcode')

  // Overlay QR
  const qrOverlay     = document.createElement('div')
  qrOverlay.id = 'qrcode-overlay'
  // ... estilos inline omitidos ...
  document.body.appendChild(qrOverlay)

  let callCounter = 0, ticketCounter = 0

  const fmtTime = ts => new Date(ts).toLocaleTimeString()

  // Renderiza QR Code
  function renderQRCode(tId) {
    qrContainer.innerHTML = ''
    qrOverlay.innerHTML   = ''
    const urlCli = `${location.origin}/?t=${tId}`
    new QRCode(qrContainer, { text: urlCli, width:128, height:128 })
    new QRCode(qrOverlay,    { text: urlCli, width:256, height:256 })
    qrContainer.onclick = () => {
      navigator.clipboard.writeText(urlCli)
      qrOverlay.style.display = 'flex'
    }
    qrOverlay.onclick = e => {
      if (e.target === qrOverlay) qrOverlay.style.display = 'none'
    }
  }

  // Atualiza manual select
  function updateManualOptions() {
    selectManual.innerHTML = '<option value="">Selecione...</option>'
    for (let i = callCounter+1; i <= ticketCounter; i++) {
      const opt = document.createElement('option')
      opt.value = i; opt.textContent = i
      selectManual.appendChild(opt)
    }
    selectManual.disabled = (callCounter+1 > ticketCounter)
  }

  // Busca status
  async function fetchStatus(t) {
    try {
      const res = await fetch(`/.netlify/functions/status?t=${t}`)
      const { currentCall, ticketCounter: tc } = await res.json()
      callCounter = currentCall
      ticketCounter = tc
      currentCallEl.textContent = currentCall>0 ? currentCall : '–'
      waitingEl.textContent     = Math.max(0, tc - currentCall)
      updateManualOptions()
    } catch(e) { console.error(e) }
  }

  // Busca cancelados
  async function fetchCancelled(t) {
    try {
      const res = await fetch(`/.netlify/functions/cancelados?t=${t}`)
      const { cancelled=[] } = await res.json()
      cancelListEl.innerHTML = ''
      cancelled.forEach(({ ticket, ts }) => {
        const li = document.createElement('li')
        li.innerHTML = `<span>${ticket}</span><span class="ts">${fmtTime(ts)}</span>`
        cancelListEl.appendChild(li)
      })
    } catch(e) { console.error(e) }
  }

  // Inicializa botões + polling
  function initApp(t) {
    btnNext.onclick = async () => {
      const id = attendantInput.value.trim()
      let url = `/.netlify/functions/chamar?t=${t}`
      if (id) url += `&id=${encodeURIComponent(id)}`
      const { called } = await (await fetch(url)).json()
      fetchStatus(t)
      fetchCancelled(t)
    }

    btnRepeat.onclick = async () => {
      await fetch(`/.netlify/functions/chamar?t=${t}&num=${callCounter}`)
      fetchStatus(t)
      fetchCancelled(t)
    }

    btnManual.onclick = async () => {
      const num = Number(selectManual.value)
      if (!num) return
      await fetch(`/.netlify/functions/chamar?t=${t}&num=${num}`)
      fetchStatus(t)
      fetchCancelled(t)
    }

    btnReset.onclick = async () => {
      if (!confirm('Resetar tickets?')) return
      await fetch(`/.netlify/functions/reset?t=${t}`, { method:'POST' })
      fetchStatus(t)
      fetchCancelled(t)
    }

    renderQRCode(t)
    fetchStatus(t)
    fetchCancelled(t)
    setInterval(() => fetchStatus(t), 5000)
    setInterval(() => fetchCancelled(t), 5000)
  }

  // Exibe app
  function showApp(label, tId) {
    onboardOverlay.hidden = true
    loginOverlay.hidden   = true
    headerEl.hidden       = false
    mainEl.hidden         = false
    bodyEl.classList.add('authenticated')
    document.getElementById('header-label').textContent = label
    initApp(tId)
  }

  // Fluxo auth/onboarding (idêntico ao original)
  ;(async () => {
    if (cfg && cfg.empresa && cfg.senha && token) {
      return showApp(cfg.empresa, token)
    }
    if (token && empresaParam) {
      // ... código de login ...
      return
    }
    onboardOverlay.hidden = false
    onboardSubmit.onclick = async () => {
      // ... código de saveMonitorConfig ...
      showApp(label, token)
    }
  })()
})
