import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore, collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, setDoc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  let partida = {};
  let unsubPartida = null;
  let unsubPending = null;
  let unsubApproved = null;
  let unsubJugadors = null;
  let pendingNoms = [];
  let approvedNoms = [];
  let jugadorsNoms = [];
  let connectatAlJoc = false;
  let jocPreguntes = [];
  let timerInterval = null;
  let tempsInici = 0;
  let tempsRestant = 0;
  let haRespost = false;
  let jugadorDocIdActiu = '';
  let jocActiu = null;
  const LS_HIDE_FINDE_MODAL = 'konehoot_hide_finde_modal';
  const MISSATGES_EXTRA = [
    "Davant la gravetat de la informacio aportada, s'activa automaticament una notificacio electronica a @policia.",
    "Alerta d'informacio sensible rebuda: enviament automatic a la comissio de drets humans del DMS.",
    "Recomanem resar tres pares nostres durant les properes sis nits de lluna plena.",
    "Una ment tan malalta només es pot netejar amb una bona dutxa d'aigua freda.",
    "Davant d'aquesta confessio, recomanem atencio psiquiatrica urgent."
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
  }

  function actualitzarBloqueigFormulari() {
    const actiu = !!jocActiu;
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
    const jocActiuLabel = document.getElementById('joc-actiu-label');
    onSnapshot(query(collection(db, 'jocs'), where('actiu', '==', true)), snap => {
      jocsDisponibles = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'ca'));
      jocActiu = jocsDisponibles[0] || null;
      if (jocActiu) {
        select.innerHTML = `<option value="${jocActiu.id}">${esc(jocActiu.nom || jocActiu.id)}</option>`;
        select.value = jocActiu.id;
        if (jocActiuLabel) jocActiuLabel.textContent = jocActiu.nom || jocActiu.id;
      } else {
        select.innerHTML = '<option value="">No hi ha joc actiu</option>';
        if (jocActiuLabel) jocActiuLabel.textContent = 'No hi ha cap joc actiu';
      }
      actualitzarTemaPerJoc();
      actualitzarBloqueigFormulari();
      obrirPopupInformatiuSiCal();
    }, () => {
      select.innerHTML = '<option value="">No s\'han pogut carregar els jocs</option>';
      if (jocActiuLabel) jocActiuLabel.textContent = 'No s\'ha pogut carregar el joc actiu';
      actualitzarBloqueigFormulari();
    });
  }

  function obrirPopupInformatiuSiCal() {
    if (!jocActiu) return;
    const esFinde = String(jocActiu.nom || '').trim().toLowerCase() === 'finde rural 2026';
    if (!esFinde) return;
    if (localStorage.getItem(LS_HIDE_FINDE_MODAL) === '1') return;
    document.getElementById('finde-modal')?.classList.add('obert');
  }

  function actualitzarTemaPerJoc() {
    const nom = String(jocActiu?.nom || '').trim().toLowerCase();
    document.body.classList.toggle('theme-finde', nom === 'finde rural 2026');
  }

  window.enviarPregunta = async function() {
    const autor    = document.getElementById('autor').value.trim();
    const pregunta = document.getElementById('pregunta').value.trim();
    const jocId = jocActiu?.id || '';
    const respostes = [
      document.getElementById('r1').value.trim(),
      document.getElementById('r2').value.trim(),
      document.getElementById('r3').value.trim(),
      document.getElementById('r4').value.trim(),
    ];
    const correcta = document.querySelector('input[name="correcta"]:checked')?.value;

    const joc = jocActiu;

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
      const usuariId = normalitzarJugadorId(autor);
      await setDoc(doc(db, 'usuaris', usuariId), {
        nom: autor,
        updatedAt: serverTimestamp()
      }, { merge: true });
      desarNom(autor);
      mostrarSuccess(autor);
    } catch (e) {
      console.error(e);
      mostrarError('Error en enviar. Torna-ho a provar.');
      btn.disabled = false;
      btn.textContent = 'Envia pregunta →';
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
    document.getElementById('btn-enviar').textContent = 'Envia pregunta →';
    document.getElementById('error-msg').style.display = 'none';
    if (jocActiu) document.getElementById('joc-select').value = jocActiu.id;
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
    const jocId = jocActiu?.id || '';
    if (!jocId) {
      mostrarError('Ara mateix no hi ha cap joc actiu.');
      return;
    }
    document.getElementById('joc-area').style.display = 'block';
    document.getElementById('joc-connectat').style.display = 'none';
    document.getElementById('joc-lobby').style.display = 'block';
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'none';
    iniciarLobbyJoc();
  };

  window.tancarElJoc = function() {
    document.getElementById('joc-area').style.display = 'none';
    document.getElementById('form-area').style.display = 'block';
    aturarLobbyJoc();
    connectatAlJoc = false;
  };

  function normalitzarJugadorId(rawNom) {
    const base = String(rawNom || '')
      .trim()
      .toLowerCase()
      .replace(/[.#$\[\]/]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '');
    return base || ('jugador_' + Math.random().toString(36).slice(2, 10));
  }

  function iniciarLobbyJoc() {
    aturarLobbyJoc();
    const jocId = jocActiu?.id || '';
    if (!jocId) return;

    const btnConnectar = document.getElementById('btn-connectar-joc');
    if (btnConnectar) {
      btnConnectar.onclick = () => connectarAlJoc(jocId);
    }

    unsubPartida = onSnapshot(doc(db, 'partida', 'estat'), snap => {
      partida = snap.exists() ? snap.data() : {};
      renderStatusJoc(jocId);
      renderStatusConnectat(jocId);
    });

    unsubPending = onSnapshot(query(collection(db, 'preguntes_pendents'), where('jocId', '==', jocId)), snap => {
      pendingNoms = snap.docs.map(d => d.data().autor).filter(Boolean);
      renderCloud();
    });

    unsubApproved = onSnapshot(query(collection(db, 'preguntes'), where('jocId', '==', jocId)), snap => {
      approvedNoms = snap.docs.map(d => d.data().autor).filter(Boolean);
      jocPreguntes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
      renderCloud();
    });

    unsubJugadors = onSnapshot(query(collection(db, 'partida', 'estat', 'jugadors'), where('jocId', '==', jocId)), snap => {
      jugadorsNoms = snap.docs.map(d => d.data().nom).filter(Boolean);
      renderCloud();
    });
  }

  function aturarLobbyJoc() {
    if (unsubPartida) unsubPartida();
    if (unsubPending) unsubPending();
    if (unsubApproved) unsubApproved();
    if (unsubJugadors) unsubJugadors();
    unsubPartida = unsubPending = unsubApproved = unsubJugadors = null;
    pendingNoms = [];
    approvedNoms = [];
    jugadorsNoms = [];
  }

  function renderStatusJoc(jocId) {
    const el = document.getElementById('joc-status');
    if (!el) return;
    if (!partida?.fase || partida.fase === 'espera') {
      el.textContent = 'El Joc encara no ha començat.';
      return;
    }
    if (partida.jocId && partida.jocId !== jocId) {
      el.textContent = 'Ara mateix s\'esta jugant un altre joc.';
      return;
    }
    if (partida.fase === 'pregunta') el.textContent = 'El Joc ha començat! Torna a la pantalla principal de joc per respondre.';
    else if (partida.fase === 'resultats') el.textContent = 'Resultats en curs.';
    else if (partida.fase === 'final') el.textContent = 'El Joc ha finalitzat.';
  }

  function renderStatusConnectat(jocId) {
    if (!connectatAlJoc) return;
    const el = document.getElementById('joc-connectat-status');
    if (!el) return;
    if (!partida?.fase || partida.fase === 'espera') {
      el.textContent = 'Connectat al joc. Esperant que l\'admin inicii la partida.';
      return;
    }
    if (partida.jocId && partida.jocId !== jocId) {
      el.textContent = 'Ara mateix s\'esta jugant un altre joc. Pots tornar enrere i esperar.';
      return;
    }
    if (partida.fase === 'pregunta') {
      el.textContent = 'La partida ha començat.';
      obrirModeJocInline(jocId);
      renderPreguntaContributor();
      return;
    }
    if (partida.fase === 'resultats') {
      el.textContent = 'Resultats en curs. Espera la següent pregunta.';
      obrirModeJocInline(jocId);
      mostrarResultatsContributor();
      return;
    }
    if (partida.fase === 'final') {
      el.textContent = 'Partida finalitzada.';
      obrirModeJocInline(jocId);
      mostrarFinalContributor();
    }
  }

  function renderCloud() {
    const el = document.getElementById('joc-cloud');
    if (!el) return;
    const nomActual = document.getElementById('autor').value.trim();
    const noms = [...new Set([...pendingNoms, ...approvedNoms, ...jugadorsNoms])].sort((a, b) => a.localeCompare(b, 'ca'));
    if (!noms.length) {
      el.innerHTML = '<span class="joc-not-started">Encara no hi ha participants en aquest joc.</span>';
      return;
    }
    el.innerHTML = noms.map(n => `<span class="joc-chip ${n === nomActual ? 'me' : ''}">${esc(n)}</span>`).join('');
  }

  async function connectarAlJoc(jocId) {
    const nom = document.getElementById('autor').value.trim();
    if (!nom) {
      mostrarError('Escriu el teu nom abans de connectar al joc.');
      return;
    }
    const jugadorId = normalitzarJugadorId(nom);
    jugadorDocIdActiu = jugadorId;
    try {
      await setDoc(doc(db, 'partida', 'estat', 'jugadors', jugadorId), {
        nom,
        jocId,
        connectatAt: serverTimestamp(),
        punts: 0
      }, { merge: true });
      connectatAlJoc = true;
      document.getElementById('joc-lobby').style.display = 'none';
      document.getElementById('joc-connectat').style.display = 'block';
      document.getElementById('joc-play').style.display = 'none';
      renderStatusConnectat(jocId);
      renderCloud();
    } catch (e) {
      mostrarError('No s\'ha pogut connectar al joc. Torna-ho a provar.');
    }
  }

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
    const alertEl = document.getElementById('success-alert');
    if (extraMsgEl) {
      const idx = Math.floor(Math.random() * MISSATGES_EXTRA.length);
      extraMsgEl.textContent = MISSATGES_EXTRA[idx];
    }
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.classList.remove('pop');
      void alertEl.offsetWidth;
      alertEl.classList.add('pop');
    }
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'flex';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function obrirModeJocInline() {
    document.getElementById('joc-connectat').style.display = 'none';
    document.getElementById('joc-lobby').style.display = 'none';
    document.getElementById('joc-play').style.display = 'block';
  }

  window.sortirModeJocInline = function() {
    document.getElementById('joc-play').style.display = 'none';
    document.getElementById('joc-connectat').style.display = 'block';
    clearInterval(timerInterval);
  };

  function showCgScreen(id) {
    ['cg-screen-espera','cg-screen-pregunta','cg-screen-resultats','cg-screen-final'].forEach(x => {
      const el = document.getElementById(x);
      if (el) el.style.display = x === id ? 'block' : 'none';
    });
  }

  function renderPreguntaContributor() {
    const idx = partida.preguntaIndex ?? 0;
    const p = jocPreguntes[idx];
    if (!p) return;
    haRespost = false;
    tempsInici = Date.now();
    showCgScreen('cg-screen-pregunta');
    document.getElementById('cg-num').textContent = `${idx + 1} / ${jocPreguntes.length}`;
    document.getElementById('cg-autor').textContent = `Autor: ${p.autor || ''}`;
    document.getElementById('cg-question').textContent = p.pregunta || '';
    p.respostes.forEach((r, i) => {
      const btn = document.getElementById(`cg-r${i}`);
      if (btn) {
        btn.textContent = `${'ABCD'[i]}`;
        btn.disabled = false;
        btn.classList.remove('sel');
        btn.classList.remove('pop-in');
        void btn.offsetWidth;
        btn.classList.add('pop-in');
      }
    });
    tempsRestant = partida.tempsPregunta || 20;
    renderTimerCg();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      tempsRestant--;
      renderTimerCg();
      if (tempsRestant <= 0) {
        clearInterval(timerInterval);
        if (!haRespost) {
          document.querySelectorAll('.cg-btn').forEach(b => b.disabled = true);
          updateDoc(doc(db, 'partida', 'estat'), { fase: 'resultats' }).catch(() => {});
        }
      }
    }, 1000);
  }

  function renderTimerCg() {
    const total = partida.tempsPregunta || 20;
    document.getElementById('cg-timer-num').textContent = String(tempsRestant);
    document.getElementById('cg-timer-fill').style.width = `${Math.max(0, tempsRestant) / total * 100}%`;
  }

  window.respondreContributor = async function(idx) {
    if (haRespost) return;
    haRespost = true;
    clearInterval(timerInterval);
    const q = jocPreguntes[partida.preguntaIndex ?? 0];
    const total = partida.tempsPregunta || 20;
    const used = (Date.now() - tempsInici) / 1000;
    const rap = Math.max(0, total - used);
    const punts = Math.round((partida.puntsBase || 1000) + (rap / total) * (partida.puntsRapidesa || 500));
    const guanyats = q && idx === q.correcta ? punts : 0;
    document.querySelectorAll('.cg-btn').forEach((b, i) => {
      b.disabled = true;
      if (i === idx) b.classList.add('sel');
    });
    try {
      await setDoc(doc(db, 'partida', 'estat', 'respostes', jugadorDocIdActiu), {
        nom: document.getElementById('autor').value.trim(),
        resposta: idx,
        punts: guanyats,
        timestamp: serverTimestamp()
      });
      if (guanyats > 0) {
        await setDoc(doc(db, 'partida', 'estat', 'jugadors', jugadorDocIdActiu), {
          nom: document.getElementById('autor').value.trim(),
          punts: increment(guanyats)
        }, { merge: true });
      }
      updateDoc(doc(db, 'partida', 'estat'), { fase: 'resultats' }).catch(() => {});
    } catch (_) {}
  };

  async function mostrarResultatsContributor() {
    showCgScreen('cg-screen-resultats');
    const q = jocPreguntes[partida.preguntaIndex ?? 0];
    if (!q) return;
    try {
      const rd = await getDoc(doc(db, 'partida', 'estat', 'respostes', jugadorDocIdActiu));
      if (!rd.exists()) {
        document.getElementById('cg-result-text').textContent = 'No has respost a temps.';
        return;
      }
      const d = rd.data();
      const ok = d.resposta === q.correcta;
      document.getElementById('cg-result-text').textContent = ok ? `Correcte! +${d.punts || 0} punts` : `Incorrecte. Resposta correcta: ${q.respostes[q.correcta]}`;
    } catch (_) {
      document.getElementById('cg-result-text').textContent = 'Resultats no disponibles.';
    }
  }

  async function mostrarFinalContributor() {
    showCgScreen('cg-screen-final');
    try {
      const jd = await getDoc(doc(db, 'partida', 'estat', 'jugadors', jugadorDocIdActiu));
      const pts = jd.exists() ? (jd.data().punts || 0) : 0;
      document.getElementById('cg-final-punts').textContent = `Puntuacio final: ${pts}`;
    } catch (_) {
      document.getElementById('cg-final-punts').textContent = 'Puntuacio final no disponible';
    }
  }
