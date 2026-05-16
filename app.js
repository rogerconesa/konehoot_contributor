import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore, collection, addDoc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDuHxOAU3hiL-8uUYuFyzP-mTyUCTR-wmw",
    authDomain: "konehoot.firebaseapp.com",
    projectId: "konehoot",
    storageBucket: "konehoot.firebasestorage.app",
    messagingSenderId: "357275257330",
    appId: "1:357275257330:web:a45bd66abb86a0747e836b"
  };

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  let jocsDisponibles = [];
  const LS_HIDE_FINDE_MODAL = 'konehoot_hide_finde_modal';
  const MISSATGES_EXTRA = [
    "Davant la gravetat de la informacio aportada, s'activa automaticament una notificacio electronica a @policia.",
    "Alerta d'informacio sensible rebuda: enviament automatic a la comissio de drets humans del DMS."
  ];

  // ── Memòria de noms (localStorage) ───────────────────────────────────
  const LS_KEY = 'konehoot_noms';

  function getNoms() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  function desarNom(nom) {
    const noms = getNoms();
    if (!noms.includes(nom)) {
      noms.unshift(nom);
      localStorage.setItem(LS_KEY, JSON.stringify(noms.slice(0, 20)));
    } else {
      // Mou al capdavant (últim usat)
      const idx = noms.indexOf(nom);
      noms.splice(idx, 1);
      noms.unshift(nom);
      localStorage.setItem(LS_KEY, JSON.stringify(noms));
    }
  }

  function renderSelectorNoms() {
    const noms = getNoms();
    const selector = document.getElementById('selector-noms');
    const autorInput = document.getElementById('autor');
    if (!noms.length) {
      selector.style.display = 'none';
      return;
    }
    selector.style.display = 'block';
    const llista = document.getElementById('noms-llista');
    llista.innerHTML = '';
    noms.forEach(nom => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'nom-chip';
      chip.textContent = nom;
      chip.onclick = () => {
        autorInput.value = nom;
        // Marca el chip actiu
        llista.querySelectorAll('.nom-chip').forEach(c => c.classList.remove('actiu'));
        chip.classList.add('actiu');
      };
      llista.appendChild(chip);
    });
    // Si el valor actual ja coincideix amb algun, marca'l
    if (autorInput.value) {
      llista.querySelectorAll('.nom-chip').forEach(c => {
        if (c.textContent === autorInput.value) c.classList.add('actiu');
      });
    }
  }

  // Init: carrega noms desats
  document.addEventListener('DOMContentLoaded', () => {
    renderSelectorNoms();
    carregarJocs();
    document.getElementById('joc-select').addEventListener('change', onCanviJoc);
    // Si hi ha un sol nom desat, omple'l automàticament
    const noms = getNoms();
    if (noms.length === 1) {
      document.getElementById('autor').value = noms[0];
      renderSelectorNoms();
    }
  });
  // ─────────────────────────────────────────────────────────────────────

  function onCanviJoc() {
    actualitzarTemaPerJoc();
    actualitzarBloqueigFormulari();
    const jocId = document.getElementById('joc-select').value;
    const joc = jocsDisponibles.find(j => j.id === jocId);
    if (String(joc?.nom || '').trim().toLowerCase() === 'finde rural 2026') {
      if (localStorage.getItem(LS_HIDE_FINDE_MODAL) === '1') return;
      document.getElementById('finde-modal')?.classList.add('obert');
    }
  }

  function actualitzarBloqueigFormulari() {
    const jocId = document.getElementById('joc-select').value;
    const actiu = !!jocId;
    ['pregunta','r1','r2','r3','r4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !actiu;
    });
    document.querySelectorAll('input[name="correcta"]').forEach(r => r.disabled = !actiu);
    const btn = document.getElementById('btn-enviar');
    if (btn) btn.disabled = !actiu;
  }

  function carregarJocs() {
    const select = document.getElementById('joc-select');
    onSnapshot(query(collection(db, 'jocs'), where('actiu', '==', true)), snap => {
      jocsDisponibles = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'ca'));
      select.innerHTML = '<option value="">Selecciona un joc</option>' +
        jocsDisponibles.map(j => `<option value="${j.id}">${esc(j.nom || j.id)}</option>`).join('');
      actualitzarTemaPerJoc();
      actualitzarBloqueigFormulari();
    }, () => {
      select.innerHTML = '<option value="">No s\'han pogut carregar els jocs</option>';
      actualitzarBloqueigFormulari();
    });
  }

  function actualitzarTemaPerJoc() {
    const jocId = document.getElementById('joc-select').value;
    const joc = jocsDisponibles.find(j => j.id === jocId);
    const nom = String(joc?.nom || '').trim().toLowerCase();
    document.body.classList.toggle('theme-finde', nom === 'finde rural 2026');
  }

  window.enviarPregunta = async function() {
    const autor    = document.getElementById('autor').value.trim();
    const pregunta = document.getElementById('pregunta').value.trim();
    const jocId = document.getElementById('joc-select').value;
    const respostes = [
      document.getElementById('r1').value.trim(),
      document.getElementById('r2').value.trim(),
      document.getElementById('r3').value.trim(),
      document.getElementById('r4').value.trim(),
    ];
    const correcta = document.querySelector('input[name="correcta"]:checked')?.value;

    const joc = jocsDisponibles.find(j => j.id === jocId);

    if (!autor || !pregunta || !jocId || respostes.some(r => !r) || correcta === undefined) {
      mostrarError('Omple tots els camps i marca la resposta correcta.');
      return;
    }

    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviant…';

    try {
      await addDoc(collection(db, 'preguntes_pendents'), {
        autor,
        jocId,
        jocNom: joc?.nom || jocId,
        pregunta,
        respostes,
        correcta: parseInt(correcta),
        estat: 'pending',
        createdAt: serverTimestamp()
      });
      desarNom(autor);
      mostrarSuccess(autor);
    } catch (e) {
      console.error(e);
      mostrarError('Error en enviar. Torna-ho a provar.');
      btn.disabled = false;
      btn.textContent = 'Enviar pregunta';
    }
  };

  window.novaContribucio = function() {
    document.getElementById('form-area').style.display = 'block';
    document.getElementById('success-area').style.display = 'none';
    // Reseteja el formulari però manté el nom
    const autor = document.getElementById('autor').value;
    document.getElementById('form').reset();
    document.getElementById('autor').value = autor;
    document.getElementById('btn-enviar').disabled = false;
    document.getElementById('btn-enviar').textContent = 'Enviar pregunta →';
    document.getElementById('error-msg').style.display = 'none';
    document.getElementById('joc-select').value = '';
    actualitzarTemaPerJoc();
    actualitzarBloqueigFormulari();
    renderSelectorNoms();
  };

  window.tancarFindeModal = function() {
    const noMore = document.getElementById('finde-no-more');
    if (noMore?.checked) localStorage.setItem(LS_HIDE_FINDE_MODAL, '1');
    document.getElementById('finde-modal')?.classList.remove('obert');
  };

  window.obrirElJoc = function() {
    document.getElementById('joc-area').style.display = 'block';
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'none';
  };

  window.tancarElJoc = function() {
    document.getElementById('joc-area').style.display = 'none';
    document.getElementById('form-area').style.display = 'block';
  };

  function mostrarError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.animation = 'none';
    requestAnimationFrame(() => el.style.animation = 'shake 0.4s ease');
  }

  function mostrarSuccess(autor) {
    document.getElementById('success-nom').textContent = autor;
    const extraMsgEl = document.getElementById('success-extra-msg');
    if (extraMsgEl) {
      const idx = Math.floor(Math.random() * MISSATGES_EXTRA.length);
      extraMsgEl.textContent = MISSATGES_EXTRA[idx];
    }
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'flex';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
