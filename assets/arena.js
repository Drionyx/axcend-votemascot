import {animate, presentAward, stopWatchingAward, reducedMotion, updateMedals} from './motion.js';
import {preferences, session, pinDigest} from "./client.js";
import {db, safeHTML, escapeHTML, roundUnavailable, reportConfig} from "./common.js";
import {roster as PERSONAJES, normalized, roundId, now, watchTime, participate, settle} from "./round.js";
import {ref, runTransaction, get, onValue, push} from "./vendor/firebase-database.js";
import {certificateName, certificateSize} from './shadow-achievement.js';
import {setShadowAccount, setShadowRound, shadowMarks, hasBoyFriend} from './shadow.js';
import {setThemeAccount} from "./themes.js";
import "./cover.js";
import {renderClock} from "./clock.js";
watchTime(db);

  const VOTE_KEY = "axcend_vote";
  const VOTER_ID_KEY = "axcend_voter_id";
  const RESCUE_KEY = "axcend_rescate";
  const USER_KEY = "axcend_username";
  const USER_ORIG_KEY = "axcend_username_original";
  const SESSION_AUTH_KEY = "axcend_session_user";





  let finVotacion = 0;
  let resetToken = "";
  let votosActuales = {};
  let totalMiembros = 41;
  let cooldowns = {};
  let rescates = {};
  let ganadorRescate = "";
  let ganadorFinal = "";
  let ganadorMetodo = "";
  let rngTriggerAt = 0;
  let rngResultado = null;
  let rngAnimacionEnCurso = false;
  let rngAnimacionMostradaKey = "";
  let votoPendiente = "";
  let rescatePendiente = "";
  let accionModal = "votar";
  let usernameActual = "";
  let usernameOriginalActual = "";
  let unsubscribeVotanteActual = null;
  let unsubscribeRescatadorActual = null;
  let appInicializada = false;
  let historialActual = {};
  let chartCerradoPorUsuario = false;
  let ultimoGanadorMostrado = "";

  let prediccionesActuales = {};
  let statsUsuarios = {};
  let statsLoaded = false;
  let rolesActuales = { lider: "", sublider: "" };
  let primerVotanteConfig = null;
  let prediccionesResueltasToken = "";
  let personajeSeleccionadoPred = null;

  let mantenimientoActivo = false;
  let mantenimientoMsg = "";
  let devBypassMantenimiento = false;
  let shortcutBuffer = "";

  let prevBadgeStats = null;
  let loginTemp = { original: "", normalized: "", mode: null };
  let cambiarPinTieneActual = false;

  function restringirSoloNumeros(input) {
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      // Permitir teclas de navegación y control
      if (['Backspace', 'Tab', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        return;
      }
      // Permitir atajos con Ctrl o Meta (Cmd en Mac): copiar, pegar, seleccionar todo
      if (e.ctrlKey || e.metaKey) {
        return;
      }
      // Bloquear cualquier tecla que no sea un número del 0 al 9
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Sanitizar en input ante autocompletado o teclados virtuales
    input.addEventListener('input', () => {
      const limpio = input.value.replace(/\D/g, '');
      if (input.value !== limpio) {
        input.value = limpio;
      }
    });

    // Sanitizar al pegar texto
    input.addEventListener('paste', (e) => {
      const textoPegado = (e.clipboardData || window.clipboardData).getData('text');
      if (!/^\d+$/.test(textoPegado)) {
        e.preventDefault();
        const soloDigitos = textoPegado.replace(/\D/g, '').slice(0, input.maxLength || 8);
        const inicio = input.selectionStart || 0;
        const fin = input.selectionEnd || 0;
        const actual = input.value;
        input.value = (actual.slice(0, inicio) + soloDigitos + actual.slice(fin)).slice(0, input.maxLength || 8);
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  function setupNumericInputs() {
    document.querySelectorAll('.pin-input-wrap input').forEach(restringirSoloNumeros);
  }

  // BOTONES PARA VER/OCULTAR PIN (OJITO)
  function setupAllPinToggles() {
    document.querySelectorAll('.pin-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const openIcon = btn.querySelector('.eye-open');
        const closedIcon = btn.querySelector('.eye-closed');
        if (openIcon && closedIcon) {
          openIcon.style.display = isPassword ? 'none' : 'block';
          closedIcon.style.display = isPassword ? 'block' : 'none';
        }
        input.focus();
      });
    });
  }

  function resetPinToggles() {
    document.querySelectorAll('.pin-toggle-btn').forEach(btn => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) input.type = 'password';
      const openIcon = btn.querySelector('.eye-open');
      const closedIcon = btn.querySelector('.eye-closed');
      if (openIcon) openIcon.style.display = 'block';
      if (closedIcon) closedIcon.style.display = 'none';
    });
  }

  // CONTROL DE SESIÓN AUTENTICADA CON PIN
  function estaAutenticado() {
    if (!usernameActual) return false;
    return session.getItem(SESSION_AUTH_KEY) === usernameActual;
  }

  async function agregarLog(tipo, subtipo, mensaje, detalles = {}) {
    try { await push(ref(db, 'logs'), { tipo, subtipo, fecha: Date.now(), mensaje, detalles }); }
    catch (e) { console.warn('log fail', e); }
  }

  function mostrarToast(mensaje, tipo = "success", medal = "") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = "toast " + tipo;
    const icon = tipo === "error" ? "⚠️" : tipo === "rescue" ? "🔥" : tipo === "dice" ? "🎲" : tipo === "oracle" ? "🔮" : tipo === "badge" ? "🏅" : "✅";
    if (medal) toast.dataset.medal=medal;
    toast.textContent = medal ? mensaje : icon+" "+mensaje;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4200);
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n; if (n === 0) return m;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
    return dp[m][n];
  }
  function coincideBusqueda(nombreNorm, q) {
    if (!q) return true;
    if (nombreNorm.includes(q)) return true;
    if (q.length < 3) return false;
    const palabras = nombreNorm.split(/[\s_]+/).filter(Boolean);
    const threshold = q.length <= 4 ? 1 : q.length <= 6 ? 2 : 3;
    if (palabras.some(p => levenshtein(p, q) <= threshold)) return true;
    if (levenshtein(nombreNorm, q) <= Math.min(threshold, 2)) return true;
    return false;
  }

  const normalizarNombre = normalized;

  function getUsername() { return preferences.getItem(USER_KEY) || ""; }
  function getUsernameOriginal() { return preferences.getItem(USER_ORIG_KEY) || ""; }
  function setUsername(original, normalized) {
    preferences.setItem(USER_KEY, normalized);
    preferences.setItem(USER_ORIG_KEY, original);
    usernameActual = normalized; usernameOriginalActual = original;
  }


  async function obtenerUsuario(normalized) {
    const snap = await get(ref(db, 'usuarios/' + normalized));
    return snap.exists() ? snap.val() : null;
  }

  async function existeLegacy(normalized) {
    const snapV = await get(ref(db, 'votantes/' + normalized));
    if (snapV.exists()) return true;
    const snapR = await get(ref(db, 'rescatadores/' + normalized));
    return snapR.exists();
  }

  async function crearUsuario(user, original, pin) {
    const hash = await pinDigest(pin);
    const tx = await runTransaction(ref(db,'usuarios/'+user), current => {
      if (current?.pin_hash) return;
      return {...current,nombreOriginal:current?.nombreOriginal || original,pin_hash:hash,creado:current?.creado || now()};
    },{applyLocally:false});
    if (!tx.committed) throw Error('Este usuario ya tiene PIN. Volvé e ingresá con tu clave.');
  }

  async function verificarPin(normalized, pin) {
    const user = await obtenerUsuario(normalized);
    if (!user || !user.pin_hash) return false;
    const hash = await pinDigest(pin);
    return hash === user.pin_hash;
  }

  async function actualizarPin(user, nuevo, original, actual) {
    const previous = actual ? await pinDigest(actual) : null;
    const hash = await pinDigest(nuevo);
    await get(ref(db,'usuarios/'+user));
    const tx = await runTransaction(ref(db,'usuarios/'+user), current => {
      if (!current && previous) return null; // Le permite al servidor reenviar el valor vigente en un reintento.
      if ((current?.pin_hash || null) !== previous) return;
      return {...current,nombreOriginal:current?.nombreOriginal || original,pin_hash:hash};
    },{applyLocally:false});
    if (!tx.committed) throw Error('El PIN actual cambió. Volvé a ingresar.');
  }

  function mostrarLoginModal() {
    const overlay = document.getElementById("loginOverlay");
    overlay.classList.remove("hidden");
    resetLoginModal();
    overlay.querySelector(".login-modal").scrollTop = 0;
    document.getElementById("inputUsername").focus({preventScroll:true});
  }
  document.getElementById('btnAbrirLogin').addEventListener('click', mostrarLoginModal);

  function cerrarLoginModal() { document.getElementById("loginOverlay").classList.add("hidden"); }

  function actualizarBotonLogin() {
    const btn = document.getElementById('btnAbrirLogin');
    if (!btn) return;
    document.getElementById('profileLink').hidden = !estaAutenticado();
    btn.style.display = estaAutenticado() ? 'none' : 'inline-flex';
  }

  function resetLoginModal() {
    document.getElementById("loginStep1").style.display = "block";
    document.getElementById("loginStep2Login").style.display = "none";
    document.getElementById("loginStep2Create").style.display = "none";
    document.getElementById("inputUsername").value = getUsernameOriginal() || "";
    document.getElementById("inputPin").value = "";
    document.getElementById("inputPinNew").value = "";
    document.getElementById("inputPinConfirm").value = "";
    document.getElementById("loginMsg1").textContent = "";
    document.getElementById("loginMsg1").className = "lm-msg";
    document.getElementById("loginMsg2").textContent = "";
    document.getElementById("loginMsg2").className = "lm-msg";
    document.getElementById("loginMsg3").textContent = "";
    document.getElementById("loginMsg3").className = "lm-msg";
    resetPinToggles();
    loginTemp = { original: "", normalized: "", mode: null };
  }

  async function continuarLogin() {
    const original = document.getElementById("inputUsername").value.trim();
    const msg = document.getElementById("loginMsg1");
    if (original.length < 2) { msg.textContent = "El nombre debe tener al menos 2 caracteres."; msg.className = "lm-msg"; return; }
    const normalized = normalizarNombre(original);
    if (normalized.length < 2) { msg.textContent = "El nombre contiene caracteres no válidos."; msg.className = "lm-msg"; return; }
    if (roundUnavailable) { msg.textContent = "Necesitás conexión con la ronda para ingresar."; msg.className = "lm-msg"; return; }
    msg.textContent = "Verificando..."; msg.className = "lm-msg loading";

    try {
      const user = await obtenerUsuario(normalized);
      if (user && user.pin_hash) {
        loginTemp = { original:user.nombreOriginal || original, normalized, mode:"login" };
        document.getElementById("loginStep1").style.display = "none";
        document.getElementById("loginStep2Login").style.display = "block";
        document.getElementById("pinLoginName").textContent = original;
        document.getElementById("inputPin").value = "";
        document.getElementById("loginMsg2").textContent = "";
        document.getElementById("loginMsg2").className = "lm-msg";
        resetPinToggles();
        setTimeout(() => document.getElementById("inputPin").focus(), 100);
      } else {
        const legacy = await existeLegacy(normalized);
        loginTemp = { original, normalized, mode: legacy ? "migrate" : "new" };
        document.getElementById("loginStep1").style.display = "none";
        document.getElementById("loginStep2Create").style.display = "block";
        const desc = document.getElementById("createDesc");
        if (legacy) {
          desc.innerHTML = safeHTML(`Bienvenido de vuelta, <strong>${escapeHTML(original)}</strong>. Por seguridad, ahora necesitás <strong>crear un PIN</strong> (4-8 dígitos) para proteger tu cuenta.`);
        } else {
          desc.innerHTML = safeHTML(`¡Hola, <strong>${escapeHTML(original)}</strong>! Elegí un <strong>PIN de 4-8 dígitos</strong> para proteger tu cuenta y votar.`);
        }
        document.getElementById("inputPinNew").value = "";
        document.getElementById("inputPinConfirm").value = "";
        document.getElementById("loginMsg3").textContent = "";
        document.getElementById("loginMsg3").className = "lm-msg";
        resetPinToggles();
        setTimeout(() => document.getElementById("inputPinNew").focus(), 100);
      }
      msg.textContent = ""; msg.className = "lm-msg";
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.className = "lm-msg";
    }
  }

  async function procesarPinLogin() {
    const pin = document.getElementById("inputPin").value;
    const msg = document.getElementById("loginMsg2");
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = "El PIN debe tener entre 4 y 8 dígitos numéricos."; msg.className = "lm-msg"; return; }
    msg.textContent = "Verificando..."; msg.className = "lm-msg loading";
    try {
      const ok = await verificarPin(loginTemp.normalized, pin);
      if (!ok) {
        msg.textContent = "PIN incorrecto."; msg.className = "lm-msg";
        document.getElementById("inputPin").value = "";
        return;
      }
      await finalizarLogin(loginTemp.original, loginTemp.normalized);
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.className = "lm-msg";
    }
  }

  async function procesarPinCreate() {
    const pin = document.getElementById("inputPinNew").value;
    const pin2 = document.getElementById("inputPinConfirm").value;
    const msg = document.getElementById("loginMsg3");
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = "El PIN debe tener entre 4 y 8 dígitos numéricos."; msg.className = "lm-msg"; return; }
    if (pin !== pin2) { msg.textContent = "Los PINs no coinciden."; msg.className = "lm-msg"; return; }
    msg.textContent = "Creando..."; msg.className = "lm-msg loading";
    try {
      await crearUsuario(loginTemp.normalized, loginTemp.original, pin);
      await finalizarLogin(loginTemp.original, loginTemp.normalized);
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.className = "lm-msg";
    }
  }

  async function finalizarLogin(original, normalized) {
    setUsername(original, normalized);
    session.setItem(SESSION_AUTH_KEY, normalized);
    session.setItem(USER_ORIG_KEY,original);
    resetLoginModal();
    cerrarLoginModal();
    actualizarHeaderUsuario();
    iniciarListenerUsuario();
    actualizarPrediccionRow();
    refrescarBotones(); renderCdPanel(); renderBadges();

    let yaVoto = false;
    try {
      const snapV = await get(ref(db, 'votantes/' + normalized));
      const snapR = await get(ref(db, 'rescatadores/' + normalized));
      yaVoto = snapV.exists() || snapR.exists();
    } catch (e) {}

    if (yaVoto) {
      mostrarToast(`Bienvenido, ${original}. Ya votaste — podés ver la votación pero no votar de nuevo.`, "success");
    } else {
      mostrarToast(`¡Bienvenido, ${original}!`, "success");
    }
    agregarLog('admin', 'login', `👤 Ingresó: ${original}`, { username: normalized, usernameOriginal: original, yaVoto });
  }

  document.getElementById("btnContinuar").addEventListener("click", continuarLogin);
  document.getElementById("inputUsername").addEventListener("keydown", (e) => { if (e.key === "Enter") continuarLogin(); });
  document.getElementById("btnEntrarPin").addEventListener("click", procesarPinLogin);
  document.getElementById("inputPin").addEventListener("keydown", (e) => { if (e.key === "Enter") procesarPinLogin(); });
  document.getElementById("btnCrearPin").addEventListener("click", procesarPinCreate);
  document.getElementById("inputPinNew").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("inputPinConfirm").focus(); });
  document.getElementById("inputPinConfirm").addEventListener("keydown", (e) => { if (e.key === "Enter") procesarPinCreate(); });

  document.getElementById("btnVolver1").addEventListener("click", () => {
    document.getElementById("loginStep2Login").style.display = "none";
    document.getElementById("loginStep1").style.display = "block";
    loginTemp = { original: "", normalized: "", mode: null };
    setTimeout(() => document.getElementById("inputUsername").focus(), 100);
  });
  document.getElementById("btnVolver2").addEventListener("click", () => {
    document.getElementById("loginStep2Create").style.display = "none";
    document.getElementById("loginStep1").style.display = "block";
    loginTemp = { original: "", normalized: "", mode: null };
    setTimeout(() => document.getElementById("inputUsername").focus(), 100);
  });
  document.getElementById("btnCerrarLogin").addEventListener("click", () => { resetLoginModal(); cerrarLoginModal(); });
  document.getElementById("loginOverlay").addEventListener("click", (e) => {
    if (e.target.id === "loginOverlay") { resetLoginModal(); cerrarLoginModal(); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!document.getElementById("loginOverlay").classList.contains("hidden")) { resetLoginModal(); cerrarLoginModal(); }
      const mc = document.getElementById("modalCambiarUsuario");
      if (mc && mc.classList.contains("active")) cerrarModalCambiarUsuario();
      const mp = document.getElementById("modalCambiarPin");
      if (mp && mp.classList.contains("active")) cerrarModalCambiarPin();
    }
  });

  window.cerrarModalCambiarUsuario = function() {
    document.getElementById("modalCambiarUsuario").classList.remove("active");
  };
  window.confirmarCambiarUsuario = function() {
    cerrarModalCambiarUsuario();
    detenerListenersUsuario();
    session.removeItem(SESSION_AUTH_KEY);
    setThemeAccount(null);
    setShadowAccount(null);
    preferences.removeItem(USER_KEY); preferences.removeItem(USER_ORIG_KEY);
    session.removeItem(VOTE_KEY+":"+usernameActual); session.removeItem(RESCUE_KEY+":"+usernameActual);
    usernameActual = ""; usernameOriginalActual = "";
    votoPendiente = ""; rescatePendiente = "";
    prevBadgeStats = null;
    actualizarHeaderUsuario(); refrescarBotones(); renderCdPanel(); renderBadges();
    actualizarPrediccionRow();
    mostrarToast("Sesión cerrada. Ingresa el nuevo usuario.", "success");
    mostrarLoginModal();
  };

  document.getElementById("btnCambiarNombre").addEventListener("click", () => {
    const nombre = usernameOriginalActual || "usuario actual";
    document.getElementById("modalCambiarText").textContent = `Actualmente estás como "${nombre}". Al cambiar, podrás ingresar con otro nombre. Tu voto y predicción (si ya hiciste) quedan registrados en el sistema. ¿Continuar?`;
    document.getElementById("modalCambiarUsuario").classList.add("active");
  });

  document.getElementById('btnCambiarUsuario2')?.addEventListener('click', () => {
    document.getElementById('btnCambiarNombre').click();
  });

  window.cerrarModalCambiarPin = function() {
    document.getElementById("modalCambiarPin").classList.remove("active");
    document.getElementById("inputPinActual").value = "";
    document.getElementById("inputPinNuevo").value = "";
    document.getElementById("inputPinNuevoConfirm").value = "";
    document.getElementById("msgCambiarPin").textContent = "";
    resetPinToggles();
  };

  document.getElementById("btnCambiarPin").addEventListener("click", async () => {
    if (!usernameActual) return;
    try {
      const user = await obtenerUsuario(usernameActual);
      cambiarPinTieneActual = !!(user && user.pin_hash);
    } catch (e) {
      mostrarToast("No se pudo consultar el PIN.", "error"); return;
    }
    const titleEl = document.getElementById("modalPinTitle");
    const textEl = document.getElementById("modalPinText");
    const wrapActual = document.getElementById("wrapPinActual");
    if (cambiarPinTieneActual) {
      titleEl.textContent = "🔐 Cambiar PIN";
      textEl.textContent = "Ingresá tu PIN actual y elegí uno nuevo.";
      wrapActual.style.display = "flex";
      document.getElementById("inputPinActual").value = "";
    } else {
      titleEl.textContent = "🔐 Crear PIN";
      textEl.textContent = "Aún no tenés PIN. Elegí uno para proteger tu cuenta.";
      wrapActual.style.display = "none";
    }
    document.getElementById("inputPinNuevo").value = "";
    document.getElementById("inputPinNuevoConfirm").value = "";
    document.getElementById("msgCambiarPin").textContent = "";
    resetPinToggles();
    document.getElementById("modalCambiarPin").classList.add("active");
    setTimeout(() => (cambiarPinTieneActual ? document.getElementById("inputPinActual") : document.getElementById("inputPinNuevo")).focus(), 100);
  });

  window.confirmarCambiarPin = async function() {
    if (!usernameActual) return;
    const nuevo = document.getElementById("inputPinNuevo").value;
    const nuevo2 = document.getElementById("inputPinNuevoConfirm").value;
    const msg = document.getElementById("msgCambiarPin");

    if (cambiarPinTieneActual) {
      const actual = document.getElementById("inputPinActual").value;
      if (!/^\d{4,8}$/.test(actual)) { msg.textContent = "PIN actual inválido (4-8 dígitos numéricos)."; return; }
      msg.textContent = "Verificando...";
      const ok = await verificarPin(usernameActual, actual).catch(() => false);
      if (!ok) { msg.textContent = "PIN actual incorrecto."; return; }
    }
    if (!/^\d{4,8}$/.test(nuevo)) { msg.textContent = "El nuevo PIN debe tener entre 4 y 8 dígitos numéricos."; return; }
    if (nuevo !== nuevo2) { msg.textContent = "Los PINs nuevos no coinciden."; return; }

    msg.textContent = "Guardando...";
    try {
      await actualizarPin(usernameActual,nuevo,usernameOriginalActual,cambiarPinTieneActual ? document.getElementById("inputPinActual").value : null);
      mostrarToast(cambiarPinTieneActual ? "🔐 PIN actualizado." : "🔐 PIN creado correctamente.", "success");
      cerrarModalCambiarPin();
      agregarLog('admin', cambiarPinTieneActual ? 'pin_cambiado' : 'pin_creado',
        `🔐 ${usernameOriginalActual} ${cambiarPinTieneActual ? 'cambió' : 'creó'} su PIN`,
        { username: usernameActual });
    } catch (e) {
      msg.textContent = "Error: " + e.message;
    }
  };

  function actualizarHeaderUsuario() {
    const badge = document.getElementById("userBadge");
    if (badge) badge.style.display = "none";
    actualizarBotonLogin();
  }

  function detenerListenersUsuario() {
    if (unsubscribeVotanteActual) { unsubscribeVotanteActual(); unsubscribeVotanteActual = null; }
    if (unsubscribeRescatadorActual) { unsubscribeRescatadorActual(); unsubscribeRescatadorActual = null; }
  }

  function iniciarListenerUsuario() {
    if (!usernameActual) return;
    detenerListenersUsuario();
    const userAlIniciar = usernameActual;
    setThemeAccount(userAlIniciar);
    setShadowAccount(userAlIniciar);
    unsubscribeVotanteActual = onValue(ref(db, 'votantes/' + usernameActual), (snap) => {
      if (userAlIniciar !== usernameActual) return;
      if (snap.exists()) {
        const val = snap.val();
        const personaje = typeof val === 'string' ? val : (val.personaje || '');
        setVote(personaje);
      } else session.removeItem(VOTE_KEY+":"+usernameActual);
      actualizarHeaderUsuario(); refrescarBotones(); renderCdPanel();
    });
    unsubscribeRescatadorActual = onValue(ref(db, 'rescatadores/' + usernameActual), (snap) => {
      if (userAlIniciar !== usernameActual) return;
      if (snap.exists()) {
        const val = snap.val();
        const personaje = typeof val === 'string' ? val : (val.personaje || '');
        setRescue(personaje);
      } else session.removeItem(RESCUE_KEY+":"+usernameActual);
      actualizarHeaderUsuario(); refrescarBotones(); renderCdPanel();
    });
  }

  function getVoterId() {
    let id = preferences.getItem(VOTER_ID_KEY);
    if (!id) { id = "v" + Date.now() + "_" + Math.random().toString(36).slice(2,10); preferences.setItem(VOTER_ID_KEY, id); }
    return id;
  }
  const params = new URLSearchParams(location.search);
  if (params.get("reset") === "1") {
    session.removeItem(VOTE_KEY+":"+usernameActual); session.removeItem(RESCUE_KEY+":"+usernameActual);
    params.delete("reset");
    const nuevaUrl = location.pathname + (params.toString() ? "?" + params.toString() : "") + location.hash;
    history.replaceState({}, "", nuevaUrl);
  }
  function getVote() { return session.getItem(VOTE_KEY+":"+usernameActual) || ""; }
  function setVote(n) { session.setItem(VOTE_KEY+":"+usernameActual, n); }
  function getRescue() { return session.getItem(RESCUE_KEY+":"+usernameActual) || ""; }
  function setRescue(n) { session.setItem(RESCUE_KEY+":"+usernameActual, n); }

  window.filtrar = function() {
    const q = document.getElementById("filtro").value.toLowerCase().trim();
    let visibles = 0;
    document.querySelectorAll("#grid .card").forEach(function(c) {
      if (c.dataset.ocultaPorCd === "1") { c.style.display = "none"; return; }
      const coincide = coincideBusqueda(c.dataset.name, q);
      c.style.display = coincide ? "" : "none";
      if (coincide) visibles++;
    });
    document.getElementById("emptySearch").hidden = visibles !== 0;
    document.getElementById("contador").textContent = visibles + " personaje" + (visibles !== 1 ? "s" : "");
  };

  let lightboxImages = [];
  let lightboxIndex = 0;
  function recolectarImagenesLightbox() {
    return Array.from(document.querySelectorAll('#grid .card img, #cdList .cd-card img'))
      .filter(img => img.offsetParent !== null);
  }
  function bindLightbox(img) {
    img.tabIndex = 0;
    img.setAttribute("role","button");
    img.setAttribute("aria-label","Ampliar "+img.alt);
    img.onkeydown = e => { if (["Enter"," "].includes(e.key)) { e.preventDefault(); img.click(); } };
    img.addEventListener("click", function() {
      lightboxImages = recolectarImagenesLightbox();
      lightboxIndex = lightboxImages.indexOf(this);
      if (lightboxIndex < 0) lightboxIndex = 0;
      abrirLightbox();
    });
  }
  let galleryEffect;
  function abrirLightbox(dir = 0) {
    if (lightboxImages.length === 0) return;
    const img = lightboxImages[lightboxIndex];
    if (!img) return;
    document.getElementById("lb-img").alt = img.alt;
    const portrait = document.getElementById("lb-img");
    portrait.src = img.src;
    galleryEffect?.cancel();
    galleryEffect = animate(portrait,[{opacity:.6,transform:'translateX(' + dir*8 + 'px)'},{opacity:1,transform:'none'}],220);
    document.getElementById("lb-name").textContent = img.alt;
    document.getElementById("lb-counter").textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    document.getElementById("lightbox").classList.add("active");
  }
  window.navegarLightbox = function(dir) {
    if (lightboxImages.length === 0) return;
    lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
    abrirLightbox(dir);
  };
  document.querySelectorAll(".card img").forEach(bindLightbox);
  window.cerrarLightbox = function() { document.getElementById("lightbox").classList.remove("active"); };
  document.addEventListener("keydown", function(e) {
    const lb = document.getElementById("lightbox");
    if (!lb.classList.contains("active")) return;
    if (e.key === "Escape") cerrarLightbox();
    else if (e.key === "ArrowLeft") { e.preventDefault(); navegarLightbox(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); navegarLightbox(1); }
  });
  document.getElementById("lightbox").addEventListener("click", function(e) {
    if (e.target.id === "lb-img") return;
    cerrarLightbox();
  });

  function votacionCerrada() { return finVotacion > 0 && now() >= finVotacion; }
  function votacionFinalizada() { return votacionCerrada() || ganadorRescate !== "" || ganadorFinal !== ""; }
  function estaEnCd(nombre) { const cd = cooldowns[nombre]; return !!(cd && cd.activo && cd.hasta > now()); }

  function calcularRankingLocal() {
    return Object.entries(votosActuales).filter(([n]) => PERSONAJES.includes(n) && !estaEnCd(n))
      .map(([n, v]) => ({ nombre: n, votos: v || 0 }))
      .filter(x => x.votos > 0).sort((a, b) => b.votos - a.votos);
  }
  function obtenerEmpateLocal() {
    const r = calcularRankingLocal();
    if (r.length < 2) return null;
    const max = r[0].votos;
    const emp = r.filter(x => x.votos === max);
    if (emp.length < 2) return null;
    return { empatados: emp, maxVotos: max };
  }

  function aplicarVisibilidadGrid() {
    const q = (document.getElementById("filtro").value || "").toLowerCase().trim();
    let visibles = 0;
    document.querySelectorAll("#grid .card").forEach(card => {
      const btn = card.querySelector(".vote-btn"); if (!btn) return;
      const nombre = btn.dataset.vote;
      if (estaEnCd(nombre)) { card.style.display = "none"; card.dataset.ocultaPorCd = "1"; }
      else {
        delete card.dataset.ocultaPorCd;
        const coincide = coincideBusqueda(card.dataset.name, q);
        card.style.display = coincide ? "" : "none";
        if (coincide) visibles++;
      }
    });
    document.getElementById("emptySearch").hidden = visibles !== 0;
    document.getElementById("contador").textContent = visibles + " personaje" + (visibles !== 1 ? "s" : "");
  }

  function refrescarBotones() {
    const v = getVote(); const r = getRescue(); const finalizada = votacionFinalizada(); const logueado = estaAutenticado();
    document.querySelectorAll("#grid .vote-btn").forEach(function(btn) {
      const nombre = btn.dataset.vote;
      btn.classList.remove("voted", "disabled", "round-closed"); btn.disabled = false;
      if (finalizada) {
        btn.textContent = "Ronda cerrada";
        btn.classList.add("round-closed");
        btn.disabled = true;
        return;
      }
      if (!logueado) { btn.classList.add("disabled"); btn.textContent = "Votar"; }
      else if (r !== "") { btn.classList.add("disabled"); btn.textContent = "Ya usaste tu voto en rescate"; btn.disabled = true; }
      else if (v === nombre) { btn.classList.add("voted"); btn.textContent = "✓ Tu voto"; btn.disabled = true; }
      else if (v !== "") { btn.classList.add("disabled"); btn.textContent = "Ya votaste por otro"; btn.disabled = true; }
      else { btn.textContent = "Votar"; }
    });
  }

  function renderCdPanel() {
    const cdList = document.getElementById("cdList");
    const r = getRescue(); const finalizada = votacionFinalizada();
    const umbral = Math.ceil(totalMiembros / 2); const logueado = estaAutenticado();
    const activos = Object.entries(cooldowns).filter(([_, cd]) => cd && cd.activo && cd.hasta > now())
      .sort((a, b) => (rescates[b[0]] || 0) - (rescates[a[0]] || 0));
    if (activos.length === 0) { cdList.innerHTML = '<div class="cd-empty">Nadie está en la Sala de Espera.</div>'; return; }
    cdList.innerHTML = "";
    activos.forEach(([nombre, cd]) => {
      const cardOriginal = [...document.querySelectorAll("#grid .card")].find(c => {
        const b = c.querySelector(".vote-btn"); return b && b.dataset.vote === nombre;
      });
      if (!cardOriginal) return;
      const imgSrc = cardOriginal.querySelector("img").src;
      const imgAlt = cardOriginal.querySelector("img").alt;
      const votosRescate = rescates[nombre] || 0;
      const pct = Math.min(100, Math.round((votosRescate / umbral) * 100));
      const div = document.createElement("div");
      div.className = "cd-card"; div.dataset.cardName = nombre;
      div.innerHTML = safeHTML(`
        <div class="cd-badge">EN COOLDOWN</div>
        <div class="img-wrap"><img src="${imgSrc}" alt="${imgAlt}" loading="lazy"></div>
        <div class="name">${nombre}</div>
        <div class="cd-time" data-hasta="${cd.hasta}">⏳ calculando...</div>
        <div class="progress">
          <div class="progress-fill" style="width:${pct}%"></div>
          <div class="progress-text">${votosRescate} / ${umbral} rescates</div>
        </div>
        <button class="salvar-btn" data-salvar="${nombre}">🔥 SALVAR</button>
      `);
      cdList.appendChild(div);
    });
    cdList.querySelectorAll("img").forEach(bindLightbox);
    cdList.querySelectorAll(".salvar-btn").forEach(btn => {
      const nombre = btn.dataset.salvar;
      const imgSrc = btn.closest(".cd-card").querySelector("img").src;
      if (finalizada) { btn.classList.add("disabled"); btn.textContent = "Ronda cerrada"; btn.disabled = true; }
      else if (!logueado) { btn.classList.add("disabled"); btn.textContent = "Rescatar"; btn.addEventListener("click", mostrarLoginModal); }
      else if (r === nombre) { btn.classList.add("voted"); btn.textContent = "✓ Tu rescate"; btn.disabled = true; }
      else if (r !== "") { btn.classList.add("disabled"); btn.textContent = "Ya usaste tu rescate"; btn.disabled = true; }
      else if (getVote() !== "") { btn.classList.add("disabled"); btn.textContent = "Ya usaste tu voto"; btn.disabled = true; }
      else { btn.addEventListener("click", () => abrirModalRescate(nombre, imgSrc)); }
    });
    actualizarContadoresCd();
  }

  function actualizarContadoresCd() {
    document.querySelectorAll('.cd-time[data-hasta]').forEach(el => {
      const hasta = parseInt(el.dataset.hasta);
      if (!hasta) return;
      const restante = hasta - Date.now();
      if (restante <= 0) { el.textContent = '⏳ 0d 0h 0m 0s'; return; }
      const d = Math.floor(restante / 86400000);
      const h = Math.floor((restante % 86400000) / 3600000);
      const m = Math.floor((restante % 3600000) / 60000);
      const s = Math.floor((restante % 60000) / 1000);
      el.textContent = `⏳ ${d}d ${h}h ${m}m ${s}s`;
    });
  }
  setInterval(actualizarContadoresCd, 1000);

  function abrirModal(nombre, imgSrc) {
    tokenModal = resetToken;
    accionModal = "votar"; votoPendiente = nombre;
    document.getElementById("modalImg").src = imgSrc;
    document.getElementById("modalName").textContent = nombre;
    document.getElementById("modalText").textContent = `¿Confirmas tu voto por "${nombre}"? Solo se puede votar una vez. Si votas aquí, ya no podrás rescatar a nadie.`;
    const btn = document.getElementById("modalConfirmBtn");
    btn.textContent = "Sí, votar"; btn.className = "modal-btn modal-btn-confirm";
    document.querySelector(".modal-content").classList.remove("cd-modal");
    document.getElementById("modalConfirm").classList.add("active");
  }
  function abrirModalRescate(nombre, imgSrc) {
    tokenModal = resetToken;
    accionModal = "salvar"; rescatePendiente = nombre;
    document.getElementById("modalImg").src = imgSrc;
    document.getElementById("modalName").textContent = nombre;
    document.getElementById("modalText").textContent = `¿Usar tu voto de rescate en "${nombre}"? El rescate usa tu único voto de la ronda.`;
    const btn = document.getElementById("modalConfirmBtn");
    btn.textContent = "🔥 Sí, rescatar"; btn.className = "modal-btn modal-btn-cd";
    document.querySelector(".modal-content").classList.add("cd-modal");
    document.getElementById("modalConfirm").classList.add("active");
  }
  window.cerrarModal = function() {
    document.getElementById("modalConfirm").classList.remove("active");
    votoPendiente = ""; rescatePendiente = "";
  };
  window.confirmarVoto = function() {
    if (accionModal === "salvar") { const n = rescatePendiente; cerrarModal(); if (n) ejecutarRescate(n); }
    else { const n = votoPendiente; cerrarModal(); if (n) ejecutarVoto(n); }
  };

  function marcarEleccion(tipo, nombre) {
    const button = tipo === 'voto'
      ? [...document.querySelectorAll('#grid [data-vote]')].find(b => b.dataset.vote === nombre)
      : [...document.querySelectorAll('#cdList [data-salvar]')].find(b => b.dataset.salvar === nombre);
    const card = button?.closest('.card,.cd-card');
    if (card) {
      const line = document.createElement('span');
      line.className = 'choice-line';
      line.setAttribute('aria-hidden','true');
      card.append(line);
      setTimeout(() => line.remove(),850);
    }
  }

  const receipts = {voto:'Voto registrado',rescate:'Rescate registrado',prediccion:'Predicción guardada'};
  function confirmarEleccion(tipo,nombre) {
    if (tipo !== 'prediccion') marcarEleccion(tipo,nombre);
    const toast = document.createElement('div');
    toast.className = 'toast receipt ' + tipo;
    const mark = document.createElement('span');
    mark.className = 'receipt-check';
    mark.setAttribute('aria-hidden','true');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = receipts[tipo];
    const who = document.createElement('span');
    who.textContent = nombre;
    copy.append(title, ' ', who);
    toast.append(mark,copy);
    document.getElementById('toastContainer').append(toast);
    setTimeout(() => toast.remove(),4100);
  }

  let tokenModal = "", tokenPred = "", enviando = false;
  async function enviarEleccion(tipo,nombre,token) {
    if (enviando) return false;
    if (!estaAutenticado()) { mostrarLoginModal(); return false; }
    enviando = true;
    const user = usernameActual;
    try {
      await participate(db,tipo,nombre,user,usernameOriginalActual,getVoterId(),token);
      if (usernameActual !== user || resetToken !== token) return false;
      confirmarEleccion(tipo,nombre);
      return true;
    } catch (err) { mostrarToast(err.message, 'error'); return false; }
    finally { enviando = false; }
  }
  const ejecutarVoto = nombre => enviarEleccion('voto',nombre,tokenModal);
  const ejecutarRescate = nombre => enviarEleccion('rescate',nombre,tokenModal);

  document.querySelectorAll("#grid .vote-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (!estaAutenticado()) {
        mostrarLoginModal();
        mostrarToast("Debes ingresar con tu usuario y PIN para votar.", "error");
        return;
      }
      if (votacionFinalizada()) { mostrarToast("La votación ya está cerrada.", "error"); return; }
      if (getRescue() !== "") { mostrarToast("Ya usaste tu voto en rescate.", "error"); return; }
      if (getVote() !== "") return;
      const nombre = btn.dataset.vote;
      if (estaEnCd(nombre)) { mostrarToast("Ese personaje está en cooldown.", "error"); return; }
      const img = btn.parentElement.querySelector("img").src;
      abrirModal(nombre, img);
    });
  });

  function actualizarCountdown() {
    renderClock({ganadorRescate,ganadorFinal,ganadorMetodo,resetToken,roundUnavailable,finVotacion,now:now()});
  }

  function actualizarMantenimiento() {
    const overlay = document.getElementById('maintenanceOverlay');
    if (!overlay) return;
    const debeBloquear = mantenimientoActivo && !devBypassMantenimiento;

    if (debeBloquear) {
      const msg = document.getElementById('mantMessageText');
      if (msg) {
        msg.textContent = mantenimientoMsg && mantenimientoMsg.trim() !== ""
          ? mantenimientoMsg
          : "Estamos haciendo unos ajustes. Volvemos en un rato.";
      }
      overlay.classList.add('active');
      document.documentElement.classList.add('no-scroll');
      document.body.classList.add('no-scroll');
    } else {
      overlay.classList.remove('active');
      document.documentElement.classList.remove('no-scroll');
      document.body.classList.remove('no-scroll');
    }

    let aviso = document.getElementById('devBypassAviso');
    if (mantenimientoActivo && devBypassMantenimiento) {
      if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'devBypassAviso';
        aviso.textContent = '🔧 MODO PRUEBAS LOCAL — el mantenimiento sigue activo para los demás usuarios';
        document.body.appendChild(aviso);
      }
    } else if (aviso) {
      aviso.remove();
    }

    if (!mantenimientoActivo) {
      devBypassMantenimiento = false;

    }
  }

  let lastCd, lastClosed;
  function cargarConfig() {
    const deadline = setTimeout(() => {
      if (!appInicializada) reportConfig('La ronda todavía no respondió. Podés explorar la galería o volver a intentarlo.');
    },8500);
    onValue(ref(db,'config'), snapshot => {
      clearTimeout(deadline);
      if (!snapshot.exists()) { setShadowRound(null); reportConfig('Todavía no hay una ronda configurada.'); return; }
      reportConfig();
      const cfg = snapshot.val();
      finVotacion = cfg.fin_votacion || 0;
      totalMiembros = cfg.total_miembros || 41;
      ganadorRescate = cfg.ganador_rescate || ''; ganadorFinal = cfg.ganador_final || '';
      ganadorMetodo = cfg.ganador_metodo || ''; rngTriggerAt = cfg.rng_trigger_at || 0;
      prediccionesResueltasToken = cfg.predicciones_resueltas_token || '';
      mantenimientoActivo = cfg.mantenimiento === true; mantenimientoMsg = cfg.mantenimiento_msg || '';
      if (resetToken && resetToken !== roundId(cfg)) {
        cerrarModal(); cerrarModalPrediccion(); chartCerradoPorUsuario = false; ultimoIntento = 0;
        mostrarToast('Empezó una nueva ronda.');
      }
      resetToken = roundId(cfg);
      setShadowRound(cfg);
      const message = document.getElementById('mensaje');
      message.textContent = cfg.mensaje || '';
      message.classList.toggle('visible',Boolean(message.textContent.trim()));
      appInicializada = true;
      actualizarCountdown(); refrescarBotones(); aplicarVisibilidadGrid(); renderCdPanel();
      actualizarAvisoEmpate(); aplicarRanking(); renderChart(); renderBadges(); actualizarMantenimiento();
      actualizarContadorVotantes(); actualizarPrediccionRow(); revisarCierre();
    },() => { clearTimeout(deadline); setShadowRound(null); reportConfig('Firebase no permitió leer la ronda. Revisá el acceso a la base de datos.'); });

    onValue(ref(db, 'cooldowns'), (snap) => {
      cooldowns = snap.val() || {};
      aplicarVisibilidadGrid(); renderCdPanel(); actualizarAvisoEmpate(); revisarCierre(); renderChart();
    });
    onValue(ref(db, 'rescates'), (snap) => {
      rescates = snap.val() || {}; renderCdPanel(); renderChart();
    });
    onValue(ref(db, 'votos'), (snap) => {
      votosActuales = snap.val() || {}; aplicarRanking();
      actualizarAvisoEmpate(); revisarCierre(); renderChart();
    });
    onValue(ref(db, 'config/rng_resultado'), (snap) => {
      if (!snap.exists()) { rngResultado = null; ocultarBannerEmpate(); return; }
      if (snap.exists()) {
        rngResultado = snap.val();
        ocultarBannerEmpate();
        const key = (rngResultado.fecha || 0) + "_" + rngResultado.ganador;
        if (key !== rngAnimacionMostradaKey && (Date.now() - (rngResultado.fecha || 0)) < 40000) {
          rngAnimacionMostradaKey = key;
          animarDados(rngResultado);
        }
      }
    });
    onValue(ref(db, 'historial'), (snap) => {
      historialActual = snap.val() || {};
      renderHallOfFame();
    });

    onValue(ref(db, 'predicciones'), (snap) => {
      prediccionesActuales = snap.val() || {};
      actualizarPrediccionRow();

    });
    onValue(ref(db, 'stats_usuarios'), (snap) => {
      statsLoaded = true;
      statsUsuarios = snap.val() || {};
      renderBadges();
    });
    onValue(ref(db, 'roles'), (snap) => {
      rolesActuales = snap.val() || { lider: "", sublider: "" };
      renderBadges();
    });
    onValue(ref(db, 'config/primer_votante'), (snap) => {
      primerVotanteConfig = snap.val() || null;
      renderBadges();
    });



    setInterval(() => {
      const key = Object.keys(cooldowns).filter(estaEnCd).sort().join('|');
      const closed = votacionFinalizada();
      if (key !== lastCd || lastClosed !== closed) {
        lastCd = key; lastClosed = closed;
        aplicarVisibilidadGrid(); renderCdPanel(); refrescarBotones(); renderChart(); actualizarPrediccionRow();
      }
      actualizarCountdown();
      actualizarAvisoEmpate(); revisarCierre();
    }, 2000);
  }

  const participantes = {votantes:{},rescatadores:{}};
  for (const path of Object.keys(participantes)) onValue(ref(db,path), snap => {
    participantes[path] = snap.val() || {}; actualizarContadorVotantes();
  });
  function actualizarContadorVotantes() {
    if (!resetToken) { document.getElementById('votantes').textContent = roundUnavailable ? 'Participación sin sincronizar' : 'Consultando participación…'; return; }
    const count = new Set([...Object.keys(participantes.votantes),...Object.keys(participantes.rescatadores)]).size;
    document.getElementById('votantes').textContent = count+' de '+totalMiembros+' participantes';
  }

  function calcularHallOfFame() {
    const stats = Object.create(null);
    Object.values(historialActual).forEach(h => {
      if (!h.ganador) return;
      if (!stats[h.ganador]) stats[h.ganador] = { victorias: 0, rescates: 0, votos: 0 };
      stats[h.ganador].victorias++;
      if (h.metodo === 'rescate') stats[h.ganador].rescates++;
      else stats[h.ganador].votos++;
    });
    return stats;
  }

  function renderHallOfFame() {
    const stats = calcularHallOfFame();
    const arr = Object.entries(stats).sort((a, b) => {
      if (b[1].victorias !== a[1].victorias) return b[1].victorias - a[1].victorias;
      return b[1].rescates - a[1].rescates;
    });
    const cont = document.getElementById('hallContainer');
    const grid = document.getElementById('hallGrid');
    const subtitle = document.getElementById('hallSubtitle');
    if (!arr.length) { grid.replaceChildren(); subtitle.textContent = 'Todavía no hay victorias registradas.'; cont.classList.remove('visible'); return; }
    cont.classList.add('visible');
    subtitle.textContent = `${arr.length} ${arr.length === 1 ? "campeón" : "campeones"} en la historia del clan`;
    grid.innerHTML = safeHTML(arr.map(([nombre, s]) => {
      const card = [...document.querySelectorAll('#grid .card')].find(c => {
        const b = c.querySelector('.vote-btn'); return b && b.dataset.vote === nombre;
      });
      const imgSrc = (card?.querySelector('img') || document.querySelector('.clan-key .brandmark')).src;
      return `
        <div class="hall-card" role="listitem">
          <div class="hall-img-wrap"><img src="${imgSrc}" alt="${escapeHTML(nombre)}" loading="lazy"></div>
          <div class="hall-name">${escapeHTML(nombre)}</div>
          <div class="hall-stats">
            <span class="hall-badge wins">🏆 ${s.victorias} victoria${s.victorias !== 1 ? 's' : ''}</span>
            ${s.rescates > 0 ? `<span class="hall-badge rescues">🔥 ${s.rescates} rescate${s.rescates !== 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      `;
    }).join(''));
  }

  window.cerrarChart = function() {
    chartCerradoPorUsuario = true;
    renderChart();
  };
  window.reabrirChart = function() {
    chartCerradoPorUsuario = false;
    renderChart();
  };

  function renderChart() {
    const cont = document.getElementById('chartContainer');
    const barsCont = document.getElementById('chartBars');
    const layout = document.getElementById('mainLayout');
    const reopenBtn = document.getElementById('chartReopenBtn');

    const debeMostrar = votacionFinalizada() || votacionCerrada();

    const ganadorActualKey = ganadorRescate || ganadorFinal || "";
    if (ganadorActualKey && ganadorActualKey !== ultimoGanadorMostrado) {
      chartCerradoPorUsuario = false;
      ultimoGanadorMostrado = ganadorActualKey;
    }
    if (!ganadorActualKey && !votacionFinalizada()) {
      ultimoGanadorMostrado = "";
      chartCerradoPorUsuario = false;
    }

    if (!debeMostrar) {
      cont.classList.remove('visible');
      layout.classList.remove('hidden');
      reopenBtn.classList.remove('visible');
      return;
    }
    if (chartCerradoPorUsuario) {
      cont.classList.remove('visible');
      layout.classList.remove('hidden');
      reopenBtn.classList.add('visible');
      return;
    }

    const esRescate = !!ganadorRescate;
    const ranking = Object.entries({...((esRescate && ganadorActualKey) ? {[ganadorActualKey]:0} : {}),...votosActuales})
      .filter(([n]) => n === ganadorActualKey || !estaEnCd(n))
      .map(([n, v]) => ({ nombre: n, votos: v || 0 }))
      .filter(x => x.votos > 0 || x.nombre === ganadorActualKey)
      .sort((a, b) => b.votos - a.votos);

    if (ranking.length === 0 && !ganadorActualKey) {
      cont.classList.remove('visible');
      layout.classList.remove('hidden');
      reopenBtn.classList.remove('visible');
      return;
    }

    let ganadores = [];
    let esEmpate = false;
    if (esRescate) {
      ganadores = [ganadorActualKey];
    } else {
      const maxVotos = ranking.length > 0 ? Math.max(...ranking.map(r => r.votos)) : 0;
      ganadores = ranking.filter(r => r.votos === maxVotos && maxVotos > 0).map(r => r.nombre);
      if (ganadorFinal) { ganadores = [ganadorFinal]; } else { esEmpate = ganadores.length > 1; }
    }

    if (ganadorActualKey) {
      const idx = ranking.findIndex(r => r.nombre === ganadorActualKey);
      if (idx > 0) {
        const [winner] = ranking.splice(idx, 1);
        ranking.unshift(winner);
      }
    }

    const totalFila = r => esRescate && r.nombre === ganadorActualKey ? rescates[r.nombre] || 0 : r.votos;
    const maxVotos = Math.max(...ranking.map(totalFila),1);

    barsCont.innerHTML = safeHTML(ranking.map((r) => {
      const pctBase = Math.max(5, (totalFila(r) / maxVotos) * 100);
      const esGanadorReal = r.nombre === ganadorActualKey;
      const estaEnEmpate = esEmpate && ganadores.includes(r.nombre);
      let rowClass = '', barClass = '', badgeHTML = '';
      if (esGanadorReal) {
        rowClass = 'is-winner'; barClass = 'winner';
        badgeHTML = esRescate ? `<span class="chart-badge resc">🔥 GANADOR</span>` : `<span class="chart-badge">👑 GANADOR</span>`;
      } else if (estaEnEmpate) {
        rowClass = 'is-tie'; barClass = 'tie';
        badgeHTML = `<span class="chart-badge tie">⚖️ EMPATE</span>`;
      }
      const votosLabel = (esRescate && esGanadorReal) ? `${rescates[ganadorActualKey] || 0} 🔥` : r.votos;
      return `
        <div class="chart-row ${rowClass}">
          <div class="chart-name" title="${r.nombre}">
            <div class="chart-name-text">${r.nombre}</div>
            ${badgeHTML}
          </div>
          <div class="chart-bar-wrap"><div class="chart-bar ${barClass}" data-pct="${pctBase}"></div></div>
          <div class="chart-votes">${votosLabel}</div>
        </div>
      `;
    }).join(''));

    cont.classList.add('visible');
    reopenBtn.classList.remove('visible');
    layout.classList.remove('hidden');

    requestAnimationFrame(() => {
      barsCont.querySelectorAll('.chart-bar').forEach(bar => {
        const pct = parseFloat(bar.dataset.pct);
        setTimeout(() => { bar.style.width = pct + '%'; }, 50);
      });
    });
  }

  async function compartirOExportarCanvas(canvas, filename, title, text, boton, btnOriginal) {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 1));
    if (!blob) throw new Error('No se pudo generar la imagen');
    
    const file = new File([blob], filename, { type: 'image/png' });
    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: title,
          text: text
        });
        mostrarToast("Compartido con éxito 📸", "success");
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Error al compartir nativo:', err);
        } else {
          return;
        }
      }
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    mostrarToast("¡Imagen descargada! 📸", "success");
  }

  async function compartirComoImagen(boton) {
    const winner = ganadorRescate || ganadorFinal;
    if (!winner || boton.disabled) return;
    const original = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Preparando imagen…';
    try {
      const portrait = document.querySelector('.winner-card img');
      await Promise.all([portrait.decode(), document.fonts.ready]);
      const canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = 1190;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#101418'; ctx.fillRect(0,0,960,1190);
      ctx.fillStyle = '#dcfa59'; ctx.font = '800 44px "Barlow Condensed", sans-serif';
      ctx.fillText('WOOFIA XXL',48,79);
      ctx.textAlign = 'right'; ctx.fillStyle = '#d8e1d9'; ctx.font = '500 24px Barlow, sans-serif';
      ctx.fillText('AXCEND  /  LATAM',912,76);
      // Misma geometría que object-fit: cover con el borde superior fijo.
      const w = 864, h = 732;
      const scale = Math.max(w/portrait.naturalWidth,h/portrait.naturalHeight);
      const sw = w/scale, sh = h/scale;
      ctx.drawImage(portrait,(portrait.naturalWidth-sw)/2,0,sw,sh,48,116,w,h);
      ctx.textAlign = 'left'; ctx.fillStyle = '#dcfa59'; ctx.font = '500 26px Barlow, sans-serif';
      ctx.fillText(ganadorRescate ? 'GANADOR POR RESCATE' : ganadorMetodo === 'rng' ? 'GANADOR POR DESEMPATE' : 'GANADOR DE LA RONDA',48,921);
      ctx.fillStyle = '#f3f3eb'; ctx.font = '800 91px "Barlow Condensed", sans-serif';
      ctx.fillText(winner.toLocaleUpperCase('es'),48,1028,864);
      const n = ganadorRescate ? rescates[winner] || 0 : votosActuales[winner] || 0;
      ctx.fillStyle = '#aeb9ba'; ctx.font = '500 32px Barlow, sans-serif';
      ctx.fillText(n+' '+(ganadorRescate ? 'rescate':'voto')+(n === 1 ? '':'s'),48,1101);
      await compartirOExportarCanvas(canvas,'woofia-'+winner.replaceAll(' ','-')+'.png','Campeón de WOOFIA XXL',winner+' ganó la ronda.',boton,original);
    } catch (error) { mostrarToast('No se pudo exportar la imagen. '+error.message,'error'); }
    finally { boton.disabled = false; boton.textContent = original; }
  }

  async function compartirResumenComoImagen(boton) {
    const btnOriginal = boton.textContent;
    boton.disabled = true; boton.textContent = '⏳ Generando...';
    try {
      const ganadorActual = ganadorRescate || ganadorFinal;
      const esRescate = !!ganadorRescate;
      const ranking = Object.entries({...((esRescate && ganadorActual) ? {[ganadorActual]:0} : {}),...votosActuales})
        .filter(([n]) => n === ganadorActual || !estaEnCd(n))
        .map(([n, v]) => ({ nombre: n, votos: v || 0 }))
        .filter(x => x.votos > 0 || x.nombre === ganadorActual)
        .sort((a, b) => b.votos - a.votos);

      if (ganadorActual) {
        const idx = ranking.findIndex(r => r.nombre === ganadorActual);
        if (idx > 0) { const [w] = ranking.splice(idx, 1); ranking.unshift(w); }
      }
      if (ranking.length === 0) throw new Error('No hay datos');

      const totalFila = r => esRescate && r.nombre === ganadorActual ? rescates[r.nombre] || 0 : r.votos;
      const maxVotos = Math.max(...ranking.map(totalFila),1);
      const W = 1200;
      const rowH = 68;
      const headerH = 260;
      const footerH = 180; 
      const H = headerH + ranking.length * rowH + footerH;

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#0f1020'); grad.addColorStop(0.5, '#1a1c30'); grad.addColorStop(1, '#0f1020');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(245,197,66,0.12)';
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }

      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 6;
      ctx.strokeRect(20, 20, W - 40, H - 40);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5c542';
      ctx.font = 'bold 56px "Segoe UI", Arial, sans-serif';
      ctx.shadowColor = 'rgba(245,197,66,0.6)'; ctx.shadowBlur = 20;
      ctx.fillText('📊 RESULTADOS FINALES', W / 2, 100);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#9aa0b5';
      ctx.font = '32px "Segoe UI", Arial, sans-serif';
      const subtitulo = ganadorActual
        ? (esRescate ? `🔥 Ganador: ${ganadorActual}` : (ganadorMetodo === 'rng' ? `🎲 Ganador por dados: ${ganadorActual}` : `🏆 Ganador: ${ganadorActual}`))
        : 'Votación cerrada';
      ctx.fillText(subtitulo, W / 2, 175);

      ctx.strokeStyle = 'rgba(245,197,66,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, 215);
      ctx.lineTo(W - 80, 215);
      ctx.stroke();

      let y = headerH;
      const barX = 380;
      const barW = 620;
      const barH = 46;

      ranking.forEach((r) => {
        const esGanador = r.nombre === ganadorActual;

        if (esGanador) {
          ctx.textAlign = 'left';
          ctx.font = '32px "Segoe UI", Arial, sans-serif';
          ctx.fillStyle = '#f5c542';
          ctx.fillText('👑', 40, y + barH / 2 + 12);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = esGanador ? '#f5c542' : '#eee';
        ctx.font = esGanador ? 'bold 28px "Segoe UI", Arial, sans-serif' : '26px "Segoe UI", Arial, sans-serif';
        let nombre = r.nombre;
        if (nombre.length > 20) nombre = nombre.slice(0, 19) + '…';
        ctx.fillText(nombre, barX - 24, y + barH / 2 + 10);

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, y, barW, barH);

        const pct = Math.max(0.05,totalFila(r) / maxVotos);
        const grad2 = ctx.createLinearGradient(barX, 0, barX + barW * pct, 0);
        if (esGanador) {
          grad2.addColorStop(0, '#f5c542'); grad2.addColorStop(0.5, '#ff9800'); grad2.addColorStop(1, '#e91e63');
        } else {
          grad2.addColorStop(0, 'rgba(245,197,66,0.65)'); grad2.addColorStop(1, 'rgba(255,152,0,0.5)');
        }
        ctx.fillStyle = grad2;
        ctx.fillRect(barX, y, barW * pct, barH);

        ctx.textAlign = 'left';
        ctx.fillStyle = esGanador ? '#f5c542' : '#9aa0b5';
        ctx.font = esGanador ? 'bold 26px "Segoe UI", Arial, sans-serif' : '24px "Segoe UI", Arial, sans-serif';
        const votosLabel = esRescate && esGanador ? `${rescates[r.nombre] || 0}🔥` : `${r.votos}`;
        ctx.fillText(votosLabel, barX + barW + 24, y + barH / 2 + 10);

        y += rowH;
      });

      ctx.strokeStyle = 'rgba(245,197,66,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, H - 120);
      ctx.lineTo(W - 80, H - 120);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(154,160,181,0.85)';
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.fillText('WOOFIA XXL · AXCEND LATAM', W / 2, H - 75);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      const totalVotos = ranking.reduce((a, b) => a + b.votos, 0);
      ctx.fillText(`${totalVotos} voto${totalVotos !== 1 ? 's' : ''} totales`, W / 2, H - 35);

      const filename = `axcend-resumen-${Date.now()}.png`;
      await compartirOExportarCanvas(canvas, filename, 'Resultados de WOOFIA XXL', 'Resumen de la votación', boton, btnOriginal);

    } catch (err) {
      console.error('Share resumen fail:', err);
      mostrarToast("No se pudo generar el resumen: " + (err.message || 'error desconocido'), "error");
    } finally {
      boton.disabled = false; boton.textContent = btnOriginal;
    }
  }
  window.compartirResumenComoImagen = compartirResumenComoImagen;

  window.abrirModalPrediccion = function() {
    if (!estaAutenticado()) {
      mostrarLoginModal();
      mostrarToast("Debes ingresar con tu usuario y PIN para poder predecir.", "error");
      return;
    }
    if (votacionFinalizada()) { mostrarToast("La votación ya está cerrada. No puedes predecir.", "error"); return; }
    if (prediccionesActuales[usernameActual] && prediccionesActuales[usernameActual].resetToken === resetToken) {
      mostrarToast("Ya predijiste en esta ronda.", "error"); return;
    }
    tokenPred = resetToken;
    personajeSeleccionadoPred = null;
    document.getElementById("predSearch").value = "";
    renderPredList();
    document.getElementById("predConfirmBtn").disabled = true;
    document.getElementById("modalPrediccion").classList.add("active");
  };
  window.cerrarModalPrediccion = function() {
    document.getElementById("modalPrediccion").classList.remove("active");
    personajeSeleccionadoPred = null;
  };
  window.filtrarPredList = function() { renderPredList(); };
  function renderPredList() {
    const q = (document.getElementById("predSearch").value || "").toLowerCase().trim();
    const list = document.getElementById("predList");
    const listFiltered = PERSONAJES.filter(p => coincideBusqueda(p.toLowerCase(), q));
    list.innerHTML = safeHTML(listFiltered.map(p => {
      const enCd = estaEnCd(p);
      const cardOrig = [...document.querySelectorAll("#grid .card")].find(c => {
        const b = c.querySelector(".vote-btn"); return b && b.dataset.vote === p;
      });
      const imgSrc = cardOrig ? cardOrig.querySelector("img").src : '';
      const sel = p === personajeSeleccionadoPred ? ' selected' : '';
      return `
        <button type="button" class="pred-item${enCd ? ' en-cd' : ''}${sel}" aria-pressed="${Boolean(sel)}" data-personaje="${p}">
          <img src="${imgSrc}" alt="${p}" loading="lazy">
          <span class="pred-name">${p}</span>
        </button>
      `;
    }).join(''));
    list.querySelectorAll('.pred-item').forEach(el => {
      el.addEventListener('click', () => {
        personajeSeleccionadoPred = el.dataset.personaje;
        list.querySelectorAll('.pred-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        list.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
        el.setAttribute('aria-pressed','true');
        document.getElementById("predConfirmBtn").disabled = false;
      });
    });
  }
  window.confirmarPrediccion = async function() {
    if (!personajeSeleccionadoPred) return;
    const btn = document.getElementById('predConfirmBtn');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try { if (await enviarEleccion('prediccion',personajeSeleccionadoPred,tokenPred)) cerrarModalPrediccion(); }
    finally { btn.disabled = !personajeSeleccionadoPred; btn.textContent = 'Confirmar predicción'; }
  };

  function actualizarPrediccionRow() {
    const btn = document.getElementById('btnPredecir');
    const conCuenta = estaAutenticado();
    const pred = conCuenta ? prediccionesActuales[usernameActual] : null;
    const registrada = Boolean(pred && pred.resetToken === resetToken);
    const cerrada = votacionFinalizada();
    const resuelta = registrada && cerrada && pred.resuelta;

    let titulo = 'Predecir ganador';
    let nota = conCuenta ? 'Una vez por ronda' : 'Ingresá para elegir';
    let marca = '↗';
    if (registrada) {
      titulo = pred.personaje;
      nota = resuelta ? (pred.acertada ? '¡Acertaste!' : 'Sin acierto') : 'Registrada';
      marca = resuelta && !pred.acertada ? '×' : '✓';
    } else if (cerrada) {
      nota = 'Ronda cerrada';
      marca = '';
    }

    document.getElementById('oracleLabel').textContent = registrada ? 'Tu predicción' : 'Oráculo';
    document.getElementById('oracleTitle').textContent = titulo;
    document.getElementById('oracleNote').textContent = nota;
    document.getElementById('oracleMark').textContent = marca;
    btn.closest('.round-activities').classList.toggle('round-closed', cerrada);
    btn.classList.toggle('oracle-hit', Boolean(resuelta && pred.acertada));
    btn.disabled = registrada || cerrada;
    btn.setAttribute('aria-controls', conCuenta ? 'modalPrediccion' : 'loginOverlay');
    btn.hidden = false;
  }

  function calcularRescatistaTop() {
    const arr = Object.entries(statsUsuarios).map(([u, s]) => ({ u, r: (s && s.rescates_emitidos) || 0 })).filter(x => x.r > 0);
    if (arr.length === 0) return [];
    const max = Math.max(...arr.map(x => x.r));
    return arr.filter(x => x.r === max).map(x => x.u);
  }

  function esSubLider(roles, username) {
    if (!roles || !roles.sublider || !username) return false;
    const s = roles.sublider;
    if (typeof s === 'string') return s === username;
    if (typeof s === 'object') return !!s[username];
    return false;
  }

  function calcularBadgesUsuario() {
    if (!estaAutenticado()) return [];
    const badges = [];
    const miStats = statsUsuarios[usernameActual] || {};
    if (rolesActuales.lider === usernameActual) badges.push({ cls: 'lider', text: 'Líder', title: 'Líder del clan' });
    if (esSubLider(rolesActuales, usernameActual)) badges.push({ cls: 'sublider', text: 'Sublíder', title: 'Sublíder del clan' });

    const primerVotoCount = miStats.primer_voto_ronda || 0;
    if (primerVotoCount > 0) {
      const esEstaRonda = primerVotanteConfig && primerVotanteConfig.resetToken === resetToken && primerVotanteConfig.username === usernameActual;
      const titulo = esEstaRonda
        ? `¡Eres el primero de esta ronda! (${primerVotoCount} en total)`
        : `Has sido el primero en votar ${primerVotoCount} ${primerVotoCount === 1 ? 'vez' : 'veces'}`;
      badges.push({ cls: 'primer-voto', text: `Primer voto${primerVotoCount > 1 ? ' x' + primerVotoCount : ''}`, title: titulo });
    }

    const topRescatistas = calcularRescatistaTop();
    if (topRescatistas.includes(usernameActual) && (miStats.rescates_emitidos || 0) > 0) {
      badges.push({ cls: 'rescatista', text: `Rescatista (${miStats.rescates_emitidos})`, title: 'El que más rescates ha emitido' });
    }
    if ((miStats.streak_actual || 0) >= 3) {
      badges.push({ cls: 'racha', text: `Racha x${miStats.streak_actual}`, title: `¡${miStats.streak_actual} predicciones seguidas acertadas!` });
    }
    if ((miStats.predicciones_acertadas || 0) > 0) {
      const n = miStats.predicciones_acertadas;
      badges.push({ cls: 'oraculo', text: `Oráculo x${n}`, title: `${n} predicci${n === 1 ? 'ón acertada' : 'ones acertadas'}` });
      badges.push({ cls: 'aciertos', text: `Aciertos: ${n}`, title: `${n} acierto${n !== 1 ? 's' : ''} en total` });
    }
    if (hasBoyFriend()) badges.push({cls:'boyfriend',text:'BoyFriend',title:'Logro secreto del misterio',icon:document.querySelector('#shadowBoyfriend img').src});
    const solves=shadowMarks(), certificates=Math.floor(solves/certificateSize);
    if (certificates) badges.push({cls:'cumlicker',text:certificateName+' ×'+certificates,title:certificateName});
    return badges;
  }

  document.getElementById('profileLink').addEventListener('click', () => {
    const panel = document.getElementById('userPanel');
    const accent = getComputedStyle(panel).getPropertyValue('--accent').trim();
    animate(panel,[{boxShadow:'0 0 0 2px ' + accent},{boxShadow:'0 0 0 2px transparent'}],650);
  });
  function checkNewBadges() {
    if (!statsLoaded) return;
    if (!estaAutenticado()) { prevBadgeStats = null; return; }
    const stats = statsUsuarios[usernameActual] || {};
    const current = {
      oraculo: stats.predicciones_acertadas || 0,
      racha: stats.streak_actual || 0,
      primerVoto: stats.primer_voto_ronda || 0,
      rescatista: stats.rescates_emitidos || 0
    };
    if (prevBadgeStats === null) { prevBadgeStats = current; return; }
    if (current.oraculo > prevBadgeStats.oraculo) {
      mostrarToast(`¡Nueva medalla de Oráculo! Total: ${current.oraculo} acierto${current.oraculo !== 1 ? 's' : ''}`, 'oracle', 'oraculo');
    }
    if (current.primerVoto > prevBadgeStats.primerVoto) {
      mostrarToast(`¡Eres el primer votante de la ronda! (${current.primerVoto} ${current.primerVoto === 1 ? 'vez' : 'veces'})`, 'badge', 'primer-voto');
    }
    if (current.racha >= 3 && current.racha > prevBadgeStats.racha) {
      mostrarToast(`¡Racha de ${current.racha} aciertos seguidos!`, 'oracle', 'racha');
    }
    prevBadgeStats = current;
  }

  document.addEventListener('shadowmedal',renderBadges);
  function renderBadges() {
    const panel = document.getElementById('userPanel');
    const avatar = document.getElementById('upAvatar');
    const nameEl = document.getElementById('upName');
    const badgesRow = document.getElementById('badgesRow');
    const layout = document.getElementById('mainLayout');
    if (!panel) return;

    if (!estaAutenticado()) {
      panel.style.display = 'none';
      if (layout) layout.classList.add('no-user');
      prevBadgeStats = null;
      badgesRow?.replaceChildren();
      return;
    }
    panel.style.display = 'flex';
    if (layout) layout.classList.remove('no-user');

    const nombreMostrar = usernameOriginalActual || usernameActual;
    if (avatar) avatar.textContent = (nombreMostrar.charAt(0) || '?').toUpperCase();
    if (nameEl) nameEl.textContent = nombreMostrar;

    const badges = calcularBadgesUsuario();
    if (badgesRow) {
      badgesRow.style.display = badges.length ? 'flex' : 'block';
      updateMedals(badgesRow,badges);
    }

    checkNewBadges();
  }

  function actualizarAvisoEmpate() {
    const el = document.getElementById('empateAviso');
    if (ganadorRescate || ganadorFinal || !votacionCerrada() || rngResultado) { ocultarBannerEmpate(); return; }
    const emp = obtenerEmpateLocal();
    if (!emp) { ocultarBannerEmpate(); return; }
    if (rngTriggerAt > 0) {
      const restante = Math.max(0, rngTriggerAt - Date.now());
      const seg = Math.ceil(restante / 1000);
      const mm = String(Math.floor(seg / 60)).padStart(2, '0');
      const ss = String(seg % 60).padStart(2, '0');
      const nombres = emp.empatados.map(x => `<strong>${x.nombre}</strong>`).join(' · ');
      el.innerHTML = safeHTML(`
        ⚖️ <strong>¡EMPATE DETECTADO!</strong><br>
        <span style="font-size:13px">${nombres} están igualados con <strong>${emp.maxVotos}</strong> votos cada uno.</span><br>
        <span style="font-size:13px;display:block;margin-top:8px">🎲 El ganador se decidirá por <strong>lanzamiento de dados</strong>.<br>¡No te lo pierdas!</span>
        <div class="emp-countdown" id="empCountdown">${mm}:${ss}</div>
        <div class="emp-note">Desempate automático en vivo para todo el clan</div>
      `);
      el.classList.add('visible');
    } else {
      const nombres = emp.empatados.map(x => `<strong>${x.nombre}</strong>`).join(' · ');
      el.innerHTML = safeHTML(`
        ⚖️ <strong>¡EMPATE DETECTADO!</strong><br>
        <span style="font-size:13px">${nombres} con <strong>${emp.maxVotos}</strong> votos cada uno.</span><br>
        <span style="font-size:13px;display:block;margin-top:8px">🎲 Programando desempate por dados...</span>
      `);
      el.classList.add('visible');
    }
  }
  function ocultarBannerEmpate() { document.getElementById('empateAviso').classList.remove('visible'); }

  let finalizando = false, ultimoIntento = 0;
  async function revisarCierre() {
    if (!appInicializada || !resetToken || !votacionFinalizada() || finalizando || now()-ultimoIntento < 2500) return;
    const ganador = ganadorRescate || ganadorFinal;
    if (ganador && prediccionesResueltasToken === resetToken && historialActual[resetToken+'_'+ganador]) return;
    if (!ganadorRescate && !ganadorFinal && (!Object.values(votosActuales).some(v=>v>0) || rngTriggerAt > now())) return;
    finalizando = true; ultimoIntento = now();
    try { await settle(db,'auto',resetToken); }
    catch (error) { console.warn('Cierre pendiente:',error.message); }
    finally { finalizando = false; }
  }

  async function animarDados(resultado) {
    if (rngAnimacionEnCurso) return;
    rngAnimacionEnCurso = true;
    const overlay = document.getElementById('diceOverlay');
    const grid = document.getElementById('diceGrid');
    const roundInfo = document.getElementById('diceRoundInfo');
    const status = document.getElementById('diceStatus');
    overlay.classList.add('active');
    status.className = "dice-status";
    const totalRondas = resultado.rondas.length;
    for (let i = 0; i < totalRondas && !reducedMotion.matches; i++) {
      const ronda = resultado.rondas[i];
      roundInfo.textContent = `Ronda ${ronda.ronda} / ${totalRondas}`;
      status.textContent = `Tirando dados...`;
      status.className = "dice-status";
      grid.innerHTML = '';
      const diceElements = {};
      ronda.candidatos.forEach(c => {
        const die = document.createElement('div');
        die.className = 'dice-die rolling';
        die.innerHTML = safeHTML(`<div class="die-name">${c}</div><div class="die-face">?</div>`);
        grid.appendChild(die);
        diceElements[c] = die;
      });
      const rollDuration = 1800;
      const startTime = Date.now();
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (reducedMotion.matches || Date.now() - startTime >= rollDuration) { clearInterval(interval); resolve(); return; }
          Object.values(diceElements).forEach(die => {
            die.querySelector('.die-face').textContent = 1 + Math.floor(Math.random() * 6);
          });
        }, 70);
      });
      ronda.candidatos.forEach(c => {
        diceElements[c].classList.remove('rolling');
        diceElements[c].querySelector('.die-face').textContent = ronda.tiradas[c];
      });
      const maxRoll = Math.max(...Object.values(ronda.tiradas));
      const winnersThisRound = ronda.candidatos.filter(c => ronda.tiradas[c] === maxRoll);
      const losers = ronda.candidatos.filter(c => ronda.tiradas[c] !== maxRoll);
      losers.forEach(c => diceElements[c].classList.add('eliminated'));
      winnersThisRound.forEach(c => diceElements[c].classList.add('winner'));
      if (winnersThisRound.length === 1) status.textContent = `🏆 ¡${winnersThisRound[0]} gana la ronda!`;
      else status.textContent = `Empate en tirada: ${winnersThisRound.join(', ')}. Nueva ronda...`;
      await new Promise(r => setTimeout(r, winnersThisRound.length === 1 ? 1700 : 1200));
    }
    roundInfo.textContent = `🎲 RESULTADO FINAL 🎲`;
    status.className = "dice-status winner-text";
    status.innerHTML = safeHTML(`🏆 ¡Ganador: ${resultado.ganador}! 🏆`);
    if (reducedMotion.matches) {
      grid.replaceChildren();
      const finalRound = resultado.rondas.at(-1);
      for (const name of finalRound?.candidatos || []) {
        const die = document.createElement('div');
        die.className = 'dice-die' + (name === resultado.ganador ? ' winner' : '');
        die.textContent = name + ' · ' + finalRound.tiradas[name];
        grid.append(die);
      }
    }
    await new Promise(r => setTimeout(r, 3500));
    overlay.classList.remove('active');
    rngAnimacionEnCurso = false;
  }

  function construirWinnerCard(original, variante, metodo, oficial) {
    const card = document.createElement('article');
    card.className = 'winner-card ' + variante;
    const frame = original.querySelector('.img-wrap').cloneNode(true);
    const image = frame.querySelector('img');
    image.loading = 'eager';
    const open = () => { lightboxImages = [image]; lightboxIndex = 0; abrirLightbox(); };
    image.addEventListener('click',open);
    image.addEventListener('keydown',e => {
      if (['Enter',' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    const details = document.createElement('div');
    details.className = 'award-details';
    const medal = document.createElement('div');
    medal.className = 'award-medal';
    medal.setAttribute('aria-hidden','true');
    const star = document.createElement('span');
    star.textContent = '★';
    medal.append(star);
    const title = document.createElement('div');
    title.className = 'award-title';
    title.textContent = oficial ? 'Campeón de la ronda' : 'Recuento en curso';
    const name = document.createElement('h2');
    name.className = 'name';
    name.textContent = original.querySelector('.name').textContent;
    const method = document.createElement('div');
    method.className = 'winner-method';
    method.textContent = metodo;
    details.append(medal,title,name,method);
    if (oficial) {
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'share-btn';
      share.textContent = 'Compartir galardón';
      share.addEventListener('click',() => compartirComoImagen(share));
      details.append(share);
    }
    card.append(frame,details);
    return card;
  }

  function aplicarRanking() {
    const container = document.getElementById('winnerContainer');
    const oficial = Boolean(ganadorRescate || ganadorFinal);
    let nombre = ganadorRescate || ganadorFinal;
    if (!nombre && votacionCerrada() && !obtenerEmpateLocal()) nombre = calcularRankingLocal()[0]?.nombre;
    const variante = ganadorRescate ? 'rescue-winner' : ganadorMetodo === 'rng' ? 'rng-winner' : 'vote-winner';
    const key = nombre ? JSON.stringify([resetToken,nombre,variante,oficial]) : '';
    if (container.dataset.award === key) return;
    stopWatchingAward();
    container.dataset.award = key;
    container.replaceChildren();
    const original = nombre && [...document.querySelectorAll('#grid .vote-btn')].find(b => b.dataset.vote === nombre)?.closest('.card');
    container.classList.toggle('visible',Boolean(original));
    if (!original) return;
    const metodo = ganadorRescate ? 'Rescate completado' : variante === 'rng-winner' ? 'Ganó el desempate' : 'Elección del clan';
    const card = construirWinnerCard(original,variante,metodo,oficial);
    container.append(card);
    if (oficial) presentAward(card,key);
  }

  function useShortcut(digits,openTab=false) {
    if (digits.endsWith('2552321')) {
      if (openTab) {
        const panel = window.open('./admin.html','_blank');
        if (panel) panel.opener = null;
        else window.location.assign('./admin.html');
      } else window.location.assign('./admin.html');
      return true;
    }
    if (mantenimientoActivo && digits.endsWith('014789')) {
      devBypassMantenimiento = !devBypassMantenimiento;
      actualizarMantenimiento();
      mostrarToast(devBypassMantenimiento ? 'Modo de pruebas activo en esta pestaña.' : 'Modo de pruebas desactivado.', 'success');
      return true;
    }
    return false;
  }
  document.addEventListener('keydown',event => {
    if (event.target.closest?.('input,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    shortcutBuffer = /^[0-9]$/.test(event.key) ? (shortcutBuffer + event.key).slice(-7) : '';
    if (useShortcut(shortcutBuffer,true)) shortcutBuffer = '';
  });
  const codeDialog = document.getElementById('clanCode');
  const digitsInput = document.getElementById('clanDigits');
  for (const crest of document.querySelectorAll('.clan-key')) {
    let taps = 0, lastTap = 0;
    crest.addEventListener('click',() => {
      const at = Date.now();
      taps = at-lastTap < 850 ? taps+1 : 1;
      lastTap = at;
      if (taps === 3) {
        taps = 0;
        digitsInput.value = '';
        codeDialog.showModal();
        digitsInput.focus();
      }
    });
  }
  codeDialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const digits = digitsInput.value;
    digitsInput.value = '';
    codeDialog.close();
    if (event.submitter?.value !== 'cancel') useShortcut(digits);
  });

  // INICIALIZACIÓN DE SESIÓN Y COMPONENTES
  setupAllPinToggles();
  setupNumericInputs();

  const storedUser = getUsername();
  const storedOriginal = getUsernameOriginal();
  const sessionUser = session.getItem(SESSION_AUTH_KEY);

  if (sessionUser) {
    usernameActual = sessionUser;
    usernameOriginalActual = session.getItem(USER_ORIG_KEY) || (storedUser === sessionUser ? storedOriginal : sessionUser);
    obtenerUsuario(usernameActual).then(u => {
      if (!u || !u.pin_hash) {
        session.removeItem(SESSION_AUTH_KEY);
        usernameActual = "";
        usernameOriginalActual = "";
        actualizarBotonLogin();
        mostrarLoginModal();
      } else {
        usernameOriginalActual = u.nombreOriginal || usernameOriginalActual;
        iniciarListenerUsuario();
        actualizarHeaderUsuario();
        refrescarBotones();
        renderCdPanel();
        renderBadges();
        actualizarPrediccionRow();
      }
    }).catch(() => { actualizarBotonLogin(); mostrarToast("No se pudo comprobar la sesión. Volvé a conectar.", "error"); });
  } else {
    usernameActual = "";
    usernameOriginalActual = "";
    actualizarBotonLogin();
  }

  document.addEventListener('roundconnection', () => { actualizarCountdown(); actualizarContadorVotantes(); });
  cargarConfig();
  document.getElementById('fileHelp').hidden = true;
  refrescarBotones();
  actualizarContadorVotantes();
  setInterval(actualizarCountdown, 1000);
