import {bonusLicks,reserveLimit} from './shadow-wallet.js';
import {startPractice} from './shadow-practice.js';
import {editionOf,nextMystery} from './shadow-round.js';
import {preferences, pinDigest} from "./client.js";
import {db, safeHTML, escapeHTML} from "./common.js";
import {roster as PERSONAJES, normalized, roundId, now, watchTime, roundWrite, settle, reopen} from "./round.js";
import { ref, get, set, remove, onValue, push, runTransaction, query, orderByKey, limitToLast } from "./vendor/firebase-database.js";
watchTime(db);
// Una lectura pública mantiene el estado de conexión vigente en la pantalla de acceso.
onValue(ref(db,'config/total_miembros'),()=>{},()=>{});





  let isAdmin = false;
  let hasRoundConfig = false;
  let finVotacion = 0;
  let totalMiembros = 41;
  let resetTokenActual = "";
  let cooldownsActuales = {};
  let rescatesActuales = {};
  let votosActuales = {};
  let votantesActuales = {};
  let rescatadoresActuales = {};
  let historialActual = {};
  let ganadorRescateActual = "";
  let ganadorFinalActual = "";
  let ganadorMetodoActual = "";
  let rngTriggerAt = 0;
  let logsCache = [];
  let filtroLogs = "all";

  let rolesActuales = { lider: "", sublider: "" };
  let prediccionesActuales = {};
  let statsUsuarios = {};
  let primerVotanteConfig = null;
  let backupsCache = {};
  let mantenimientoActivo = false;
  let usuariosCache = {};

  const votosRevelados = new Set();
  const rescatesRevelados = new Set();


  function aplicarTema() {
    const saved = preferences.getItem("axcend_admin_theme");
    if (saved === "light") document.body.classList.add("light");
    else if (saved === "dark") document.body.classList.remove("light");

  }
  window.toggleTheme = function() {
    document.body.classList.toggle("light");
    preferences.setItem("axcend_admin_theme", document.body.classList.contains("light") ? "light" : "dark");
  };
  aplicarTema();

  async function agregarLog(tipo, subtipo, mensaje, detalles = {}) {
    try { await push(ref(db, 'logs'), { tipo, subtipo, fecha: Date.now(), mensaje, detalles }); }
    catch (e) { console.warn('No se pudo guardar log:', e); }
  }

  function formatearFechaHora(ts) {
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  const normalizarUsername = normalized;
  const subscriptions = [];
  function listen(...args) { subscriptions.push(onValue(...args)); }

  const auditTypes = new Map([
    ['voto','Voto'], ['rescate','Rescate'], ['cd','Cooldown'], ['rng','Dados'],
    ['admin','Administración'], ['prediccion','Predicción']
  ]);
  const dayFormat = new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long',year:'numeric'});
  const timeFormat = new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const searchKey = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const logList = document.getElementById('logsList');
  const logSearch = document.getElementById('logSearch');

  function cargarLogs() {
    listen(query(ref(db,'logs'),orderByKey(),limitToLast(100)), snap => {
      logsCache = Object.entries(snap.val() || {}).map(([key,value]) => {
        const entry = typeof value === 'string' ? {mensaje:value} : value || {};
        const type = entry.subtipo === 'prediccion' ? 'prediccion' : entry.tipo || 'admin';
        const label = auditTypes.get(type) || String(type);
        const rawTime = Number(entry.fecha);
        const time = rawTime > 0 && Number.isFinite(new Date(rawTime).getTime()) ? rawTime : 0;
        return {key,entry,type,label,time,search:searchKey([label,entry.subtipo,entry.mensaje,JSON.stringify(entry.detalles)].join(' '))};
      }).sort((a,b)=>b.time-a.time || b.key.localeCompare(a.key));
      renderLogs();
    },() => {
      logsCache = [];
      logList.textContent = 'No se pudo leer el registro.';
      document.getElementById('logCount').textContent = '';
    });
  }

  function logNode(tag,className,text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderLogs() {
    const query = searchKey(logSearch.value.trim());
    const visible = logsCache.filter(log =>
      (filtroLogs === 'all' || log.type === filtroLogs) && log.search.includes(query)
    );
    const open = new Set(Array.from(logList.querySelectorAll('details[open]'),el=>el.closest('article').dataset.key));
    const content = document.createDocumentFragment();
    let group, previousDay;
    for (const {key,entry,type,label,time} of visible) {
      const day = time ? dayFormat.format(time) : 'Sin fecha';
      if (day !== previousDay) {
        group = logNode('section','log-day');
        group.append(logNode('h3','',day));
        content.append(group);
        previousDay = day;
      }
      const row = logNode('article','log-item log-'+(auditTypes.has(type) ? type : 'otro'));
      row.dataset.key = key;
      const at = logNode('time','',time ? timeFormat.format(time) : '—');
      if (time) at.dateTime = new Date(time).toISOString();
      const main = logNode('div','event-main');
      main.append(logNode('div','log-mensaje',entry.mensaje || String(entry.subtipo || label).replaceAll('_',' ')));
      const fields = entry.detalles && typeof entry.detalles === 'object' ? Object.entries(entry.detalles) : [];
      if (entry.subtipo && entry.subtipo !== type) fields.unshift(['acción',String(entry.subtipo).replaceAll('_',' ')]);
      if (fields.length) {
        const details = logNode('details');
        const properties = logNode('dl','log-properties');
        for (const [name,value] of fields) {
          const pair = logNode('div');
          const title = name.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
          const data = logNode('dd');
          if (value !== null && typeof value === 'object') data.append(logNode('pre','',JSON.stringify(value,null,2)));
          else data.textContent = value == null ? '—' : String(value);
          pair.append(logNode('dt','',title),data);
          properties.append(pair);
        }
        details.open = open.has(key);
        details.append(logNode('summary','','Ver detalles'),properties);
        main.append(details);
      }
      const removeButton = logNode('button','log-del','Eliminar');
      removeButton.type = 'button';
      removeButton.dataset.key = key;
      removeButton.setAttribute('aria-label','Eliminar evento · '+(entry.mensaje || label));
      row.append(at,logNode('span','event-category',label),main,removeButton);
      group.append(row);
    }
    const count=visible.length;
    document.getElementById('logCount').textContent = count+' '+(count===1 ? 'evento' : 'eventos');
    if (!count) content.append(logNode('p','log-empty',logsCache.length ? 'Ningún evento coincide con los filtros.' : 'Todavía no hay actividad registrada.'));
    logList.replaceChildren(content);
  }
  logSearch.addEventListener('input',renderLogs);
  document.querySelector('.logs-filters').addEventListener('click',event=>{
    const filter=event.target.closest('[data-filtro]');
    if (!filter) return;
    filtroLogs=filter.dataset.filtro;
    for(const button of document.querySelectorAll('[data-filtro]')) button.setAttribute('aria-pressed',String(button===filter));
    renderLogs();
  });
  logList.addEventListener('click',async event=>{
    const button=event.target.closest('.log-del');
    if (!button || !isAdmin || !confirm('¿Eliminar este evento del registro?')) return;
    try { await remove(ref(db,'logs/'+button.dataset.key)); }
    catch { alert('No se pudo eliminar el evento. Volvé a intentar.'); }
  });


  document.getElementById('btnLimpiarLogs').addEventListener('click', async () => {
    if (!isAdmin) return;
    if (!confirm('⚠️ ¿Borrar TODOS los logs?')) return;
    if (!confirm('¿Estás seguro?')) return;
    await remove(ref(db, 'logs'));
    await agregarLog('admin', 'logs_limpiados', '🧹 Se limpiaron todos los logs', {});
  });


  function tsToLocalInput(ts) {
    const d = new Date(ts);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }
  function formatearFechaBonita(ts) {
    return new Date(ts).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function estaEnCdAdmin(nombre) {
    const cd = cooldownsActuales[nombre];
    return !!(cd && cd.activo && cd.hasta > Date.now());
  }
  function votacionCerrada() { return finVotacion > 0 && now() >= finVotacion; }
  function calcularRanking() {
    return Object.entries(votosActuales).filter(([n]) => !estaEnCdAdmin(n))
      .map(([n, v]) => ({ nombre: n, votos: v || 0 }))
      .filter(x => x.votos > 0).sort((a, b) => b.votos - a.votos);
  }
  function obtenerEmpate() {
    const r = calcularRanking();
    if (r.length < 2) return null;
    const max = r[0].votos;
    const emp = r.filter(x => x.votos === max);
    if (emp.length < 2) return null;
    return { empatados: emp, maxVotos: max };
  }

  function getSublideresList(roles) {
    if (!roles || !roles.sublider) return [];
    const s = roles.sublider;
    if (typeof s === 'string') return s ? [s] : [];
    if (typeof s === 'object') return Object.keys(s).filter(k => s[k]);
    return [];
  }

  function tienePin(username) {
    return !!(usuariosCache[username] && usuariosCache[username].pin_hash);
  }

  async function verificarUsuarioExiste(username) {
    try {
      const snapV = await get(ref(db, `votantes/${username}`));
      if (snapV.exists()) return { ok: true, tipo: 'votante' };
      const snapR = await get(ref(db, `rescatadores/${username}`));
      if (snapR.exists()) return { ok: true, tipo: 'rescatador' };
      const snapU = await get(ref(db, `usuarios/${username}`));
      if (snapU.exists()) return { ok: true, tipo: 'usuario registrado' };
      return { ok: false, tipo: null };
    } catch (e) {
      console.warn('Error verificando usuario:', e);
      return { ok: null, tipo: null };
    }
  }

  const BACKUP_KEYS = ['votos', 'votantes', 'cooldowns', 'rescates', 'rescatadores', 'predicciones', 'stats_usuarios', 'historial', 'roles', 'config', 'usuarios'];

  async function crearBackup(tipo, cambios = {}) {
    let backupKey;
    await roundWrite(db, async () => {
      const datos = (await get(ref(db))).val() || {};
      const ts = now();
      backupKey = ts+'_'+tipo;
      const backup = Object.fromEntries(BACKUP_KEYS.filter(k => datos[k] != null).map(k => [k,datos[k]]));
      backup._meta = {version:2,fecha:ts,tipo,resumen:resumenBackup(datos)};
      const cambiosConCopia = {...cambios,['backups/'+backupKey]:backup};
      const nuevaRonda = cambios['config/reset_token'];
      if (nuevaRonda) cambiosConCopia['config/sombra'] = nextMystery(datos.config || {},nuevaRonda);
      const anteriores = Object.keys(datos.backups || {}).sort().reverse();
      anteriores.slice(4).forEach(k => { cambiosConCopia['backups/'+k] = null; });
      return cambiosConCopia;
    });
    await agregarLog('admin','backup_creado','Copia guardada · '+tipo,{backupKey,tipo});
    return backupKey;
  }

  function resumenBackup(datos) {
    const votos = datos.votos || {};
    const votantes = datos.votantes || {};
    const cooldowns = datos.cooldowns || {};
    const usuarios = datos.usuarios || {};
    const nVotantes = new Set([...Object.keys(votantes),...Object.keys(datos.rescatadores || {})]).size;
    const nCooldowns = Object.entries(cooldowns).filter(([_, cd]) => cd && cd.activo && cd.hasta > Date.now()).length;
    const totalVotos = Object.values(votos).reduce((a, b) => a + (b || 0), 0);
    const nUsuarios = Object.values(usuarios).filter(u => u && u.pin_hash).length;
    return { nVotantes, nCooldowns, totalVotos, nUsuarios };
  }

  async function restaurarBackup(backupKey) {
    if (!isAdmin) return;
    const backup = backupsCache[backupKey];
    if (!backup) { alert("Backup no encontrado."); return; }

    const meta = backup._meta || {};
    const resumen = meta.resumen || {};
    if (!confirm(`⚠️ RESTAURAR BACKUP\n\nFecha: ${formatearFechaBonita(meta.fecha || 0)}\nTipo: ${meta.tipo || 'manual'}\n\nVotantes: ${resumen.nVotantes || 0}\nVotos totales: ${resumen.totalVotos || 0}\nCooldowns activos: ${resumen.nCooldowns || 0}\nPINs guardados: ${resumen.nUsuarios || 0}\n\nEsto REEMPLAZARÁ todo el estado actual con el del backup. Se perderán los votos/rescates/cambios hechos después de ese backup.\n\n¿Continuar?`)) return;
    if (!confirm("¿Estás TOTALMENTE seguro? Esta acción no se puede deshacer automáticamente (pero puedes crear otro backup antes).")) return;

    try {
      await crearBackup('antes_restore', Object.fromEntries(
        BACKUP_KEYS.filter(k => k !== 'usuarios' || backup[k] !== undefined || meta.version >= 2).map(k => [k,backup[k] ?? null])
      ));

      await agregarLog('admin', 'backup_restaurado',
        `♻️ Backup restaurado (${meta.tipo || 'manual'} · ${formatearFechaBonita(meta.fecha || 0)})`,
        { backupKey, meta });

      alert('✅ Backup restaurado correctamente.\n\nSe creó un backup del estado anterior por si necesitas revertir esto.');
    } catch (e) {
      alert("❌ Error al restaurar: " + e.message);
    }
  }

  async function eliminarBackup(backupKey) {
    if (!isAdmin) return;
    if (!confirm('¿Eliminar este backup? No podrá recuperarse.')) return;
    try {
      await remove(ref(db, `backups/${backupKey}`));
      await agregarLog('admin', 'backup_eliminado', `🗑 Backup eliminado`, { backupKey });
    } catch (e) { alert("❌ " + e.message); }
  }

  function renderBackups() {
    const cont = document.getElementById('backupsList');
    const keys = Object.keys(backupsCache).sort().reverse();

    if (keys.length === 0) {
      cont.innerHTML = '<div class="backups-empty">No hay backups todavía.<br><span style="font-size:11px;opacity:.7">Se crearán automáticamente antes de cada Reset/Reinicio.</span></div>';
      return;
    }

    cont.innerHTML = safeHTML(keys.map(key => {
      const b = backupsCache[key];
      const meta = b._meta || {};
      const resumen = meta.resumen || {};
      const tipoCls = meta.tipo === 'reset_total' ? 'reset' : meta.tipo === 'reiniciar_votos' ? 'reiniciar' : 'reiniciar';
      const tipoText = meta.tipo === 'reset_total' ? 'RESET' : meta.tipo === 'reiniciar_votos' ? 'REINICIO' : meta.tipo === 'antes_restore' ? 'PRE-RESTORE' : 'MANUAL';
      const fecha = meta.fecha ? formatearFechaHora(meta.fecha) : '—';
      const pinInfo = resumen.nUsuarios ? ` · 🔐 ${resumen.nUsuarios} PINs` : '';

      return `
        <div class="backup-item">
          <div class="bi-info">
            <div class="bi-titulo">
              <span class="bi-tipo ${tipoCls}">${tipoText}</span>
              <span>${fecha}</span>
            </div>
            <div class="bi-meta">👥 ${resumen.nVotantes || 0} votantes · 🗳 ${resumen.totalVotos || 0} votos · ⏳ ${resumen.nCooldowns || 0} CDs${pinInfo}</div>
          </div>
          <div class="bi-actions">
            <button class="bi-btn restore" data-restore="${key}">Restaurar</button>
            <button class="bi-btn delete" data-delete="${key}">Eliminar</button>
          </div>
        </div>
      `;
    }).join(''));

    cont.querySelectorAll('.bi-btn.restore').forEach(btn => {
      btn.addEventListener('click', () => restaurarBackup(btn.dataset.restore));
    });
    cont.querySelectorAll('.bi-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => eliminarBackup(btn.dataset.delete));
    });
  }

  document.getElementById('btnCrearBackupManual').addEventListener('click', async () => {
    if (!isAdmin) return;
    if (!confirm('¿Crear un backup manual del estado actual?')) return;
    try {
      await crearBackup('manual');
      alert('✅ Backup manual creado.');
    } catch (e) { alert("❌ " + e.message); }
  });

  function renderMantenimiento() {
    const toggle = document.getElementById('inputMantenimiento');
    const label = document.getElementById('mantStatusLabel');
    toggle.checked = mantenimientoActivo;
    if (mantenimientoActivo) {
      label.className = 'mant-status on';
      label.textContent = '🔴 ACTIVO';
    } else {
      label.className = 'mant-status off';
      label.textContent = 'DESACTIVADO';
    }
  }

  document.getElementById('inputMantenimiento').addEventListener('change', async (e) => {
    if (!isAdmin) return;
    const activar = e.target.checked;
    if (activar) {
      if (!confirm('🔧 ACTIVAR MANTENIMIENTO\n\nEl index mostrará un aviso y bloqueará el acceso a los usuarios.\n\n¿Continuar?')) {
        e.target.checked = false;
        return;
      }
    }
    try {
      await roundWrite(db,async () => ({'config/mantenimiento':activar}));
      await agregarLog('admin', activar ? 'mantenimiento_on' : 'mantenimiento_off',
        activar ? '🔧 Modo mantenimiento ACTIVADO' : '✅ Modo mantenimiento DESACTIVADO', {});
    } catch (err) {
      e.target.checked = !activar;
      alert("❌ " + err.message);
    }
  });

  document.getElementById('btnGuardarMantMsg').addEventListener('click', async () => {
    if (!isAdmin) return;
    const val = document.getElementById('inputMantMsg').value.trim();
    try {
      await set(ref(db, 'config/mantenimiento_msg'), val);
      await agregarLog('admin', 'mantenimiento_msg',
        val ? `💬 Mensaje de mantenimiento actualizado: "${val}"` : '🗑 Mensaje de mantenimiento borrado', {});
      alert(val ? "✅ Mensaje guardado." : "✅ Mensaje borrado.");
    } catch (err) { alert("❌ " + err.message); }
  });

  const loginDiv = document.getElementById("login");
  const adminDiv = document.getElementById("admin");
  const loginMsg = document.getElementById("loginMsg");
  const keywordInput = document.getElementById("keyword");

  document.getElementById("loginBtn").addEventListener("click", intentarLogin);
  keywordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") intentarLogin(); });

  async function intentarLogin() {
    loginMsg.textContent = "";
    const valor = keywordInput.value.trim();
    if (!valor || isAdmin) return;
    try {
      const snap = await get(ref(db, "config/admin_key_hash"));
      if (!snap.exists()) { loginMsg.textContent = "⚠️ No hay hash configurado."; return; }
      const hashEsperado = String(snap.val()).trim().toLowerCase();
      const hashIngresado = await pinDigest(valor);
      if (hashIngresado === hashEsperado) {
        if (isAdmin) return;
        isAdmin = true;
        loginDiv.classList.add("hidden");
        adminDiv.classList.add("visible");
        iniciarPanel();
        document.querySelector('.admin-nav [aria-selected="true"]')?.focus({preventScroll:true});
      } else {
        loginMsg.textContent = "❌ Clave incorrecta.";
        keywordInput.value = "";
      }
    } catch (err) { loginMsg.textContent = "❌ Error: " + err.message; }
  }

  document.getElementById('reserveForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if (!isAdmin || !hasRoundConfig) return;
    const input=document.getElementById('reserveLimit'), limit=input.valueAsNumber;
    const status=document.getElementById('reserveStatus'), save=document.getElementById('reserveSave');
    if (!Number.isSafeInteger(limit) || limit<1) { status.textContent='Ingresá un número entero mayor que cero.'; return; }
    save.disabled=true; status.textContent='Guardando…';
    try {
      await roundWrite(db,async()=>{
        if (!isAdmin) throw Error('Volvé a ingresar al panel.');
        const cfg=(await get(ref(db,'config'))).val();
        if (!cfg) throw Error('No se pudo leer la configuración.');
        const previous=reserveLimit(cfg);
        if (limit===previous) return;
        const changes={'config/sombra_max_lenguetazos':limit};
        if (limit<previous) {
          const accounts=await get(ref(db,'usuarios'));
          accounts.forEach(account=>{
            if (account.child('sombra/reserva/saldo').val()>limit) changes['usuarios/'+account.key+'/sombra/reserva/saldo']=limit;
          });
        }
        const key=push(ref(db,'logs')).key;
        changes['logs/'+key]={tipo:'admin',subtipo:'reserva_misterio',mensaje:'Máximo de lengüetazos guardados: '+limit,fecha:now(),detalles:{anterior:previous,nuevo:limit}};
        return changes;
      });
      status.textContent='Máximo guardado · '+limit+' por cuenta.';
    } catch(error) {status.textContent=error.message;}
    finally {save.disabled=false;}
  });

  const grantForm=document.getElementById('grantLicksForm');
  grantForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const save=document.getElementById('grantSave'), status=document.getElementById('grantStatus');
    if (!isAdmin || save.disabled) return;
    const nameInput=document.getElementById('grantUser'), amountInput=document.getElementById('grantAmount');
    const username=normalized(nameInput.value), amount=amountInput.valueAsNumber;
    if (!username || !Number.isSafeInteger(amount) || amount<1) {
      status.textContent='Ingresá un nombre de usuario y una cantidad entera mayor que cero.';
      return;
    }
    save.disabled=true; nameInput.readOnly=true; amountInput.readOnly=true;
    status.textContent='Verificando cuenta…';
    let receipt;
    try {
      await roundWrite(db,async()=>{
        if (!isAdmin) throw Error('Volvé a ingresar al panel.');
        const account=await get(ref(db,'usuarios/'+username));
        if (!account.exists() || !(account.child('pin_hash').exists() || account.child('nombreOriginal').exists()))
          throw Error('No se encontró una cuenta registrada con ese nombre.');
        const display=account.child('nombreOriginal').val() || username;
        const previous=bonusLicks(account.child('sombra').val()), total=previous+amount;
        if (!Number.isSafeInteger(total)) throw Error('La cantidad supera el saldo admitido.');
        receipt=display+' recibió '+amount+' '+(amount===1?'lamida':'lamidas')+'. Saldo adicional: '+total+'.';
        const logKey=push(ref(db,'logs')).key;
        return {
          ['usuarios/'+username+'/sombra/lamidas_admin']:total,
          ['logs/'+logKey]:{tipo:'admin',subtipo:'agregar_lamidas',mensaje:receipt,fecha:now(),
            detalles:{username,cantidad:amount,anterior:previous,nuevo:total}}
        };
      });
      status.textContent=receipt;
      amountInput.value='';
    } catch (error) { status.textContent=error.message; }
    finally {save.disabled=false; nameInput.readOnly=false; amountInput.readOnly=false;}
  });

  function renderRoundStatus() {
    const closed = Boolean(ganadorRescateActual || ganadorFinalActual || votacionCerrada());
    const label = document.getElementById('aCerrada');
    if (!hasRoundConfig) { label.textContent='Sin datos'; label.className='round-state'; return; }
    label.textContent = closed ? 'Cerrada' : 'Abierta';
    label.className = 'round-state '+(closed ? 'closed' : 'open');
  }

  let setPracticeEdition;
  function iniciarPanel() {
    if (!setPracticeEdition) setPracticeEdition=startPractice();
    listen(ref(db, "config"), (snap) => {
      hasRoundConfig = snap.exists();
      if (!hasRoundConfig) { renderRoundStatus(); return; }
      const c = snap.val();
      setPracticeEdition(editionOf(c));
      finVotacion = c.fin_votacion || 0;
      totalMiembros = c.total_miembros || 41;
      ganadorRescateActual = c.ganador_rescate || "";
      ganadorFinalActual = c.ganador_final || "";
      ganadorMetodoActual = c.ganador_metodo || "";
      rngTriggerAt = c.rng_trigger_at || 0;
      resetTokenActual = roundId(c);
      mantenimientoActivo = c.mantenimiento === true;

      document.getElementById("aMiembros").textContent = totalMiembros;

      renderRoundStatus();
      for (const [id,value] of [['reserveLimit',reserveLimit(c)],['inputMiembros',totalMiembros],['inputMensaje',c.mensaje || ''],['inputCdDias',c.cd_dias || 60]]) {
        const input = document.getElementById(id);
        if (input !== document.activeElement && input.value === input.defaultValue) input.value = value;
        input.defaultValue = value;
      }
      document.getElementById("inputAutoCd").checked = c.auto_cd_activo === true;
      if (!document.getElementById('inputMantMsg').matches(':focus')) {
        document.getElementById("inputMantMsg").value = c.mantenimiento_msg || "";
      }

      document.getElementById("aGanadorRescate").textContent = ganadorRescateActual || "—";
      document.getElementById("aGanadorFinal").textContent = ganadorFinalActual
        ? ganadorFinalActual + (ganadorMetodoActual === 'rng' ? ' 🎲 (RNG)' : '')
        : "—";

      const elTrigger = document.getElementById("aRngTrigger");
      if (rngTriggerAt > 0) {
        const seg = Math.max(0, Math.ceil((rngTriggerAt - Date.now()) / 1000));
        elTrigger.textContent = seg > 0 ? `🎲 en ${seg}s` : "⏳ En curso...";
        elTrigger.className = "status-purple";
      } else {
        elTrigger.textContent = "—";
        elTrigger.className = "";
      }

      const inpF = document.getElementById("inputFecha");
      const txtF = document.getElementById("aFechaActual");
      if (c.fin_votacion && c.fin_votacion > 1) {
        if (document.activeElement !== inpF) inpF.value = tsToLocalInput(c.fin_votacion);
        txtF.textContent = formatearFechaBonita(c.fin_votacion);
      } else {
        if (document.activeElement !== inpF) inpF.value = "";
        txtF.textContent = "Sin fecha límite";
      }

      chequearEmpate();
      actualizarEmpateEstado();
      renderPredicciones();
      renderMantenimiento();
      renderPrimerVotante();
      renderCdSection();
    });

    listen(ref(db, "votantes"), (snap) => {
      votantesActuales = snap.val() || {};
      mostrarParticipacion();
      renderPersonasList();
    });
    listen(ref(db, "rescatadores"), (snap) => {
      rescatadoresActuales = snap.val() || {};
      mostrarParticipacion();
      renderPersonasList();
    });
    listen(ref(db, "cooldowns"), (snap) => {
      cooldownsActuales = snap.val() || {};
      renderCdSection(); chequearEmpate();
    });
    listen(ref(db, "rescates"), (snap) => {
      rescatesActuales = snap.val() || {};
      renderCdSection();
    });
    listen(ref(db, "votos"), (snap) => {
      votosActuales = snap.val() || {};
      chequearEmpate();
    });
    listen(ref(db, "historial"), (snap) => {
      historialActual = snap.val() || {};
      renderStats();
    });
    listen(ref(db, "roles"), (snap) => {
      rolesActuales = snap.val() || { lider: "", sublider: "" };
      renderRoles(); renderPersonasList();
    });
    listen(ref(db, "predicciones"), (snap) => {
      prediccionesActuales = snap.val() || {};
      renderPredicciones();
    });
    listen(ref(db, "stats_usuarios"), (snap) => {
      statsUsuarios = snap.val() || {};
      renderPredicciones(); renderPersonasList();
    });
    listen(ref(db, "config/primer_votante"), (snap) => {
      primerVotanteConfig = snap.val() || null;
      renderPrimerVotante();
      renderPersonasList();
    });
    listen(ref(db, "backups"), (snap) => {
      backupsCache = snap.val() || {};
      renderBackups();
    });
    listen(ref(db, "usuarios"), (snap) => {
      usuariosCache = snap.val() || {};
      renderUsuariosPin();
      renderPersonasList();
    });

    cargarLogs();
  }

  function mostrarParticipacion() { document.getElementById("aVotantes").textContent = new Set([...Object.keys(votantesActuales),...Object.keys(rescatadoresActuales)]).size; }
  function renderPrimerVotante() {
    const el = document.getElementById('aPrimerVotante');
    if (!primerVotanteConfig || primerVotanteConfig.resetToken !== resetTokenActual) {
      el.textContent = "—";
      el.style.removeProperty("color");
      return;
    }
    const nombre = (votantesActuales[primerVotanteConfig.username] && votantesActuales[primerVotanteConfig.username].nombreOriginal)
      || primerVotanteConfig.usernameOriginal
      || primerVotanteConfig.username;
    el.textContent = `🌟 ${nombre}`;
    el.style.color = "var(--accent)";
    el.style.fontWeight = "700";
  }

  function renderUsuariosPin() {
    const cont = document.getElementById('usuariosPinList');
    const counter = document.getElementById('usuariosPinCounter');
    if (!cont) return;

    const entries = Object.entries(usuariosCache).filter(([k, v]) => v && v.pin_hash);
    if (entries.length === 0) {
      cont.innerHTML = '<div class="usuarios-pin-empty">Ningún usuario ha creado PIN todavía.</div>';
      if (counter) counter.innerHTML = '';
      return;
    }
    entries.sort((a, b) => (b[1].creado || 0) - (a[1].creado || 0));
    cont.innerHTML = safeHTML(entries.map(([username, u]) => {
      const nombre = u.nombreOriginal || username;
      const fecha = u.creado ? formatearFechaHora(u.creado) : '—';
      return `
        <div class="usuario-pin-item">
          <div class="upi-info">
            <div class="upi-name">🔐 ${escapeHTML(nombre)} <span class="upi-meta">(${escapeHTML(username)})</span></div>
            <div class="upi-fecha">Creado: ${fecha}</div>
          </div>
          <button class="upi-btn-reset" data-reset-pin="${escapeHTML(username)}" title="Resetear PIN (conserva votos, medallas y stats)">🔄</button>
        </div>
      `;
    }).join(''));

    cont.querySelectorAll('[data-reset-pin]').forEach(btn => {
      btn.addEventListener('click', () => resetearPin(btn.dataset.resetPin));
    });

    if (counter) counter.innerHTML = safeHTML(`<b>${entries.length}</b> usuario${entries.length !== 1 ? 's' : ''} con PIN registrado`);
  }

  async function resetearPin(username) {
    if (!isAdmin) return;
    const u = usuariosCache[username];
    if (!u) return;
    const nombre = u.nombreOriginal || username;
    if (!confirm(`🔄 RESETEAR PIN\n\nUsuario: "${nombre}" (${username})\n\nEsto SOLO borrará su PIN de acceso. Se conservan intactos:\n• Sus votos\n• Sus rescates\n• Sus medallas y logros\n• Su historial y estadísticas\n\nEn su próximo login deberá crear un PIN nuevo.\n\n¿Continuar?`)) return;

    try {
      await remove(ref(db, `usuarios/${username}/pin_hash`));
      await agregarLog('admin', 'pin_reseteado',
        `🔄 PIN reseteado para "${nombre}" (${username})`,
        { username, nombreOriginal: nombre });
      alert(`✅ PIN de "${nombre}" reseteado.\n\nSus votos, medallas y stats se conservan.`);
    } catch (err) {
      alert("❌ " + err.message);
    }
  }

  function renderSublideres() {
    const cont = document.getElementById('sublideresList');
    const sublideres = getSublideresList(rolesActuales);
    if (sublideres.length === 0) {
      cont.innerHTML = '<div class="sublideres-empty">Sin sublíderes asignados</div>';
      return;
    }
    cont.innerHTML = safeHTML(sublideres.map(u => {
      const nombre = (votantesActuales[u] && votantesActuales[u].nombreOriginal)
        || (rescatadoresActuales[u] && rescatadoresActuales[u].nombreOriginal)
        || (usuariosCache[u] && usuariosCache[u].nombreOriginal)
        || u;
      return `
        <div class="sublider-item">
          <div class="si-name">⭐ ${escapeHTML(nombre)} <span class="si-meta">(${escapeHTML(u)})</span></div>
          <button class="si-del" data-del-sublider="${escapeHTML(u)}" title="Quitar sublider">🗑</button>
        </div>`;
    }).join(''));
    cont.querySelectorAll('[data-del-sublider]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!isAdmin) return;
        const u = btn.dataset.delSublider;
        if (!confirm(`¿Quitar a "${u}" como Sublíder?`)) return;
        try {
          await runTransaction(ref(db,'roles/sublider'), value => {
            if (typeof value === 'string') return value === u ? null : value;
            const next = {...value}; delete next[u]; return next;
          });
          await agregarLog('admin', 'rol_quitado', `⭐ Rol de Sublíder removido (${u})`, {});
        } catch (err) { alert("❌ " + err.message); }
      });
    });
  }

  function renderRoles() {
    const infoLider = document.getElementById('liderActualInfo');
    const inputLider = document.getElementById('inputLider');

    if (rolesActuales.lider) {
      const nombre = (votantesActuales[rolesActuales.lider] && votantesActuales[rolesActuales.lider].nombreOriginal)
        || (rescatadoresActuales[rolesActuales.lider] && rescatadoresActuales[rolesActuales.lider].nombreOriginal)
        || (usuariosCache[rolesActuales.lider] && usuariosCache[rolesActuales.lider].nombreOriginal)
        || rolesActuales.lider;
      infoLider.className = 'rol-info activo';
      infoLider.innerHTML = safeHTML(`👑 Actualmente: <strong>${escapeHTML(nombre)}</strong> <span style="opacity:.7;font-size:11px">(${escapeHTML(rolesActuales.lider)})</span>`);
      if (!inputLider.matches(':focus')) inputLider.value = rolesActuales.lider;
    } else {
      infoLider.className = 'rol-info vacio';
      infoLider.textContent = 'Sin líder asignado';
      if (!inputLider.matches(':focus')) inputLider.value = '';
    }

    const btnQL = document.getElementById('btnQuitarLider');
    if (btnQL) btnQL.disabled = !rolesActuales.lider;

    renderSublideres();
  }

  async function guardarRolLider() {
    if (!isAdmin) return;
    const input = document.getElementById('inputLider');
    const rawVal = input.value.trim();
    const val = normalizarUsername(rawVal);

    if (!rawVal) {
      if (!confirm(`¿Quitar el rol de Líder?`)) return;
      try {
        await remove(ref(db, `roles/lider`));
        await agregarLog('admin', 'rol_quitado', `👑 Rol de Líder removido`, {});
      } catch (err) { alert("❌ " + err.message); }
      return;
    }

    if (val.length < 2) { alert("Username demasiado corto."); return; }

    const check = await verificarUsuarioExiste(val);
    if (check.ok === null) {
      alert("❌ Error al verificar el usuario. Intenta de nuevo.");
      return;
    }
    if (!check.ok) {
      if (!confirm(`⚠️ El usuario "${val}" NO está registrado como votante, rescatador ni usuario con PIN.\n\nPuede que hayas escrito mal el nombre.\n\n¿Asignar 👑 Líder de todas formas?`)) return;
    } else {
      if (!confirm(`Asignar 👑 Líder a "${val}"? (${check.tipo})`)) return;
    }

    try {
      await set(ref(db, `roles/lider`), val);
      await agregarLog('admin', 'rol_asignado', `👑 "${val}" ahora es Líder`, { username: val });
      alert(`✅ "${val}" es ahora Líder`);
    } catch (err) { alert("❌ " + err.message); }
  }

  async function agregarSublider() {
    if (!isAdmin) return;
    const input = document.getElementById('inputSublider');
    const rawVal = input.value.trim();
    const val = normalizarUsername(rawVal);

    if (!rawVal || val.length < 2) { alert("Username inválido."); return; }

    const snap = await get(ref(db, 'roles/sublider'));
    let current = snap.val();
    if (typeof current === 'string') current = current ? { [current]: true } : {};
    if (!current || typeof current !== 'object') current = {};
    if (current[val]) { alert(`"${val}" ya es Sublíder.`); return; }

    const check = await verificarUsuarioExiste(val);
    if (check.ok === null) {
      alert("❌ Error al verificar el usuario. Intenta de nuevo.");
      return;
    }
    if (!check.ok) {
      if (!confirm(`⚠️ El usuario "${val}" NO está registrado como votante, rescatador ni usuario con PIN.\n\n¿Agregar ⭐ Sublíder de todas formas?`)) return;
    } else {
      if (!confirm(`Agregar a "${val}" como Sublíder? (${check.tipo})`)) return;
    }

    try {
      await runTransaction(ref(db,'roles/sublider'), value => ({
        ...(typeof value === 'string' ? {[value]:true} : value),[val]:true
      }));
      await agregarLog('admin', 'rol_asignado', `⭐ "${val}" ahora es Sublíder`, { username: val });
      input.value = '';
      alert(`✅ "${val}" es ahora Sublíder`);
    } catch (err) { alert("❌ " + err.message); }
  }

  document.getElementById('btnGuardarLider').addEventListener('click', guardarRolLider);
  document.getElementById('btnGuardarSublider').addEventListener('click', agregarSublider);

  document.getElementById('btnQuitarLider').addEventListener('click', async () => {
    if (!isAdmin) return;
    if (!rolesActuales.lider) { alert('No hay líder asignado.'); return; }
    if (!confirm(`¿Quitar el rol de Líder a "${rolesActuales.lider}"?`)) return;
    try {
      await remove(ref(db, 'roles/lider'));
      await agregarLog('admin', 'rol_quitado', `👑 Rol de Líder removido (${rolesActuales.lider})`, {});
      alert('✅ Líder removido.');
    } catch (err) { alert("❌ " + err.message); }
  });

  function renderPredicciones() {
    const statsEl = document.getElementById('predStatsInfo');
    const list = document.getElementById('prediccionesList');
    if (!resetTokenActual) {
      statsEl.innerHTML = '<div class="personas-empty" style="padding:12px">Esperando datos...</div>';
      list.innerHTML = '';
      return;
    }
    const predsRonda = Object.entries(prediccionesActuales)
      .filter(([u, p]) => p && p.resetToken === resetTokenActual)
      .map(([u, p]) => ({ username: u, ...p }));
    if (predsRonda.length === 0) {
      statsEl.innerHTML = '<div class="personas-empty" style="padding:12px">Nadie ha predicho en esta ronda todavía.</div>';
      list.innerHTML = '';
      return;
    }
    const nTotal = predsRonda.length;
    const nAcertadas = predsRonda.filter(p => p.resuelta === true && p.acertada === true).length;
    const nFalladas = predsRonda.filter(p => p.resuelta === true && p.acertada === false).length;
    const nPendientes = predsRonda.filter(p => !p.resuelta).length;
    statsEl.innerHTML = safeHTML(`
      <div class="pred-stats-grid">
        <div class="pred-stat-box"><div class="psb-value">${nTotal}</div><div class="psb-label">Predicciones</div></div>
        <div class="pred-stat-box"><div class="psb-value" style="color:#4CAF50">${nAcertadas}</div><div class="psb-label">Acertadas</div></div>
        <div class="pred-stat-box"><div class="psb-value" style="color:${nPendientes > 0 ? '#a855f7' : '#ff5c5c'}">${nPendientes > 0 ? nPendientes : nFalladas}</div><div class="psb-label">${nPendientes > 0 ? 'Pendientes' : 'Falladas'}</div></div>
      </div>
    `);
    predsRonda.sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    list.innerHTML = safeHTML(predsRonda.map(p => {
      const nombre = (votantesActuales[p.username] && votantesActuales[p.username].nombreOriginal)
        || (rescatadoresActuales[p.username] && rescatadoresActuales[p.username].nombreOriginal)
        || p.username;
      const fecha = p.fecha ? formatearFechaHora(p.fecha) : '—';
      let claseExtra = 'pendiente';
      let resultHTML = '<span class="pa-result pendiente">⏳ Pendiente</span>';
      if (p.resuelta === true) {
        if (p.acertada) { claseExtra = 'acertada'; resultHTML = '<span class="pa-result acierto">✅ Acertó</span>'; }
        else { claseExtra = 'fallada'; resultHTML = '<span class="pa-result fallo">❌ Falló</span>'; }
      }
      return `
        <div class="pred-item-admin ${claseExtra}">
          <div class="pa-info">
            <div class="pa-name">${escapeHTML(nombre)} <span style="font-weight:400;color:var(--sub);font-size:11px">(${escapeHTML(p.username)})</span></div>
            <div class="pa-pred">Predijo: <b>${p.personaje}</b></div>
            <div class="pa-fecha">${fecha}</div>
          </div>
          ${resultHTML}
        </div>
      `;
    }).join(''));
  }

  function extraerDatosPersona(valor, username) {
    if (typeof valor === 'string') return { personaje: valor, nombreOriginal: username, fecha: 0 };
    return { personaje: valor.personaje || '', nombreOriginal: valor.nombreOriginal || username, fecha: valor.fecha || 0 };
  }

  function calcularRescatistaTop() {
    const arr = Object.entries(statsUsuarios).map(([u, s]) => ({ u, r: (s && s.rescates_emitidos) || 0 })).filter(x => x.r > 0);
    if (arr.length === 0) return [];
    const max = Math.max(...arr.map(x => x.r));
    return arr.filter(x => x.r === max).map(x => x.u);
  }

  function calcularBadgesPersona(username) {
    const badges = [];
    if (rolesActuales.lider === username) badges.push({ cls: 'lider', html: 'Líder' });
    const sublideres = getSublideresList(rolesActuales);
    if (sublideres.includes(username)) badges.push({ cls: 'sublider', html: 'Sublíder' });
    if (primerVotanteConfig && primerVotanteConfig.resetToken === resetTokenActual && primerVotanteConfig.username === username) {
      badges.push({ cls: 'primer-voto', html: 'Primer voto' });
    }
    const stats = statsUsuarios[username] || {};
    if ((stats.streak_actual || 0) >= 3) badges.push({ cls: 'racha', html: `Racha x${stats.streak_actual}` });
    if ((stats.predicciones_acertadas || 0) > 0) badges.push({ cls: 'oraculo', html: `Oráculo x${stats.predicciones_acertadas}` });
    if (tienePin(username)) badges.push({ cls: 'pin', html: '🔐 PIN' });
    return badges;
  }

  function renderPersonasList() {
    const cont = document.getElementById('personasList');
    const counter = document.getElementById('personasCounter');
    const todos = [];
    Object.entries(votantesActuales).forEach(([username, valor]) => {
      const d = extraerDatosPersona(valor, username);
      todos.push({ username, tipo: 'voto', personaje: d.personaje, nombreOriginal: d.nombreOriginal, fecha: d.fecha });
    });
    Object.entries(rescatadoresActuales).forEach(([username, valor]) => {
      const d = extraerDatosPersona(valor, username);
      todos.push({ username, tipo: 'rescate', personaje: d.personaje, nombreOriginal: d.nombreOriginal, fecha: d.fecha });
    });
    const nVotantes = Object.keys(votantesActuales).length;
    const nRescatadores = Object.keys(rescatadoresActuales).length;
    if (todos.length === 0) {
      cont.innerHTML = '<div class="personas-empty">Nadie ha votado ni rescatado aún.</div>';
      counter.innerHTML = safeHTML(`<b>0</b> de ${totalMiembros} han votado · <b class="resc">0</b> rescates`);
      return;
    }
    todos.sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    const topRescatistas = calcularRescatistaTop();
    cont.innerHTML = safeHTML(todos.map(p => {
      const set = p.tipo === 'rescate' ? rescatesRevelados : votosRevelados;
      const revelado = set.has(p.username) ? ' revealed' : '';
      const claseExtra = p.tipo === 'rescate' ? ' rescate-item' : '';
      const accion = p.tipo === 'rescate' ? '🔥 Rescató a:' : '🗳 Votó por:';
      const fecha = p.fecha ? formatearFechaHora(p.fecha) : '—';
      const badges = calcularBadgesPersona(p.username);
      if (topRescatistas.includes(p.username)) {
        const r = (statsUsuarios[p.username] && statsUsuarios[p.username].rescates_emitidos) || 0;
        if (r > 0) badges.push({ cls: 'rescatista', html: `Rescatista (${r})` });
      }
      const badgesHTML = badges.map(b => `<span class="badge-mini ${b.cls}"${b.cls==='pin'?'':' data-medal="'+b.cls+'"'}>${b.html}</span>`).join('');
      return `
        <div class="persona-item${claseExtra}">
          <div class="p-info">
            <div class="p-name">${escapeHTML(p.nombreOriginal)}<span class="p-meta">(${escapeHTML(p.username)})</span>${badgesHTML}</div>
            <div class="p-vote${revelado}" data-reveal-user="${escapeHTML(p.username)}" data-reveal-tipo="${escapeHTML(p.tipo)}" title="Clic para ${revelado ? 'ocultar' : 'revelar'}">
              ${accion} <span class="p-vote-blurred" data-real="${escapeHTML(p.personaje || '—')}"></span>
            </div>
            <div class="p-fecha">${fecha}</div>
          </div>
          <button class="p-del" data-del-user="${escapeHTML(p.username)}" data-del-tipo="${escapeHTML(p.tipo)}" title="Eliminar ${p.tipo === 'rescate' ? 'rescate' : 'voto'}">Eliminar</button>
        </div>`;
    }).join(''));

    cont.querySelectorAll('.p-vote[data-reveal-user]').forEach(el => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.p-del')) return;
        const username = el.dataset.revealUser;
        const tipo = el.dataset.revealTipo;
        const set = tipo === 'rescate' ? rescatesRevelados : votosRevelados;
        if (el.classList.toggle('revealed')) set.add(username);
        else set.delete(username);
      });
    });
    cont.querySelectorAll('.p-del').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const username = btn.dataset.delUser;
        const tipo = btn.dataset.delTipo;
        if (tipo === 'rescate') eliminarRescatador(username);
        else eliminarVotante(username);
      });
    });
    counter.innerHTML = safeHTML(`<b>${nVotantes}</b> de ${totalMiembros} han votado · <b class="resc">${nRescatadores}</b> rescate${nRescatadores !== 1 ? 's' : ''}`);
  }

  async function eliminarVotante(username) {
    if (!isAdmin) return;
    const v = votantesActuales[username];
    if (!v) return;
    const d = extraerDatosPersona(v, username);
    const personaje = d.personaje;
    if (!confirm(`¿Eliminar el voto de "${d.nombreOriginal}"?\n\nPersonaje votado: ${personaje || '—'}\n\nEsto liberará su nombre y restará 1 voto a ese personaje.`)) return;
    try {
      await roundWrite(db,async () => {
        const path = 'votantes/'+username;
        const current = (await get(ref(db,path))).val();
        if (!current) return;
        const name = extraerDatosPersona(current,username).personaje;
        const changes = {[path]:null};
        if (name) {
          const countPath = 'votos/'+name;
          changes[countPath] = Math.max(0,((await get(ref(db,countPath))).val() || 0)-1);
        }
        return changes;
      });
      votosRevelados.delete(username);
      await agregarLog('voto', 'voto_eliminado',
        `🗑 Admin eliminó el voto de "${d.nombreOriginal}" (${username}) que votó por "${personaje}"`,
        { username, nombreOriginal: d.nombreOriginal, personaje });
      alert('✅ Voto eliminado.');
    } catch (e) { alert('❌ ' + e.message); }
  }

  async function eliminarRescatador(username) {
    if (!isAdmin) return;
    const r = rescatadoresActuales[username];
    if (!r) return;
    const d = extraerDatosPersona(r, username);
    const personaje = d.personaje;
    if (!confirm(`¿Eliminar el rescate de "${d.nombreOriginal}"?\n\nPersonaje rescatado: ${personaje || '—'}\n\nEsto liberará su nombre y restará 1 rescate a ese personaje.`)) return;
    try {
      await roundWrite(db,async () => {
        const path = 'rescatadores/'+username;
        const current = (await get(ref(db,path))).val();
        if (!current) return;
        const name = extraerDatosPersona(current,username).personaje;
        const changes = {[path]:null};
        if (name) {
          const countPath = 'rescates/'+name;
          changes[countPath] = Math.max(0,((await get(ref(db,countPath))).val() || 0)-1);
        }
        return changes;
      });
      rescatesRevelados.delete(username);
      await agregarLog('rescate', 'rescate_eliminado',
        `🗑 Admin eliminó el rescate de "${d.nombreOriginal}" (${username}) que rescató a "${personaje}"`,
        { username, nombreOriginal: d.nombreOriginal, personaje });
      alert('✅ Rescate eliminado.');
    } catch (e) { alert('❌ ' + e.message); }
  }

  function renderCdSection() {
    const disponibles = [];
    const enCd = [];
    PERSONAJES.forEach(nombre => {
      const cd = cooldownsActuales[nombre];
      const activo = cd && cd.activo && cd.hasta > Date.now();
      if (activo) enCd.push({ nombre, cd });
      else disponibles.push(nombre);
    });
    const gridDisp = document.getElementById("cdDisponibles");
    const selected = new Set([...gridDisp.querySelectorAll("input:checked")].map(i => i.value));
    if (disponibles.length === 0) {
      gridDisp.innerHTML = '<div class="personas-empty" style="grid-column:1/-1;padding:12px">Todos los personajes están en CD.</div>';
    } else {
      gridDisp.innerHTML = safeHTML(disponibles.map(nombre => `
        <label class="cd-item">
          <input type="checkbox" value="${escapeHTML(nombre)}">
          <span class="nombre">${escapeHTML(nombre)}</span>
        </label>
      `).join(''));
    }
    gridDisp.querySelectorAll("input").forEach(i => { i.checked = selected.has(i.value); });
    const listaActivos = document.getElementById("cdActivos");
    const umbral = Math.ceil(totalMiembros / 2);
    if (enCd.length === 0) {
      listaActivos.innerHTML = '<div class="personas-empty">Nadie está en CD actualmente.</div>';
    } else {
      enCd.sort((a, b) => a.cd.hasta - b.cd.hasta);
      listaActivos.innerHTML = safeHTML(enCd.map(({ nombre, cd }) => {
        const dias = Math.max(0, Math.ceil((cd.hasta - Date.now()) / 86400000));
        const rescates = rescatesActuales[nombre] || 0;
        return `
          <div class="cd-activo-item">
            <div class="cda-info">
              <div class="cda-name">${escapeHTML(nombre)}</div>
              <div class="cda-meta">⏳ ${dias} día${dias !== 1 ? 's' : ''} restantes</div>
              <div class="cda-progress">🔥 <b>${rescates}/${umbral}</b> rescates</div>
            </div>
            <button class="cda-liberar" data-liberar="${escapeHTML(nombre)}">Liberar</button>
          </div>`;
      }).join(''));
      listaActivos.querySelectorAll('.cda-liberar').forEach(btn => {
        btn.addEventListener('click', () => liberarCd(btn.dataset.liberar));
      });
    }
    actualizarRescateInfo();
  }

  async function liberarCd(nombre) {
    if (!isAdmin) return;
    if (!confirm(`¿Liberar a "${nombre}" del CD?\n\nEsto quitará su cooldown y volverá a estar disponible para votar.`)) return;
    try {
      await roundWrite(db,async () => ({["cooldowns/"+nombre]:null}));
      await agregarLog('cd', 'liberado_manual', `🔓 Admin liberó a "${nombre}" del CD`, { personaje: nombre });
    } catch (err) { alert("❌ " + err.message); }
  }

  function actualizarRescateInfo() {
    const umbral = Math.ceil(totalMiembros / 2);
    const activos = Object.entries(cooldownsActuales).filter(([_, cd]) => cd && cd.activo && cd.hasta > Date.now());
    if (activos.length === 0) {
      document.getElementById("rescateInfo").textContent = "No hay personajes en la Sala de Espera.";
      return;
    }
    const lineas = activos.map(([nombre]) => {
      const r = rescatesActuales[nombre] || 0;
      return `• ${escapeHTML(nombre)}: <strong>${r}/${umbral}</strong> rescates`;
    }).join("<br>");
    document.getElementById("rescateInfo").innerHTML =
      safeHTML(`<strong>Rescates en curso (umbral: ${umbral}):</strong><br>${lineas}`);
  }

  function renderStats() {
    const rounds = Object.values(historialActual).filter(round => round?.ganador);
    const counts = rounds.flatMap(round => {
      const count = round.participantes;
      if (count != null && count !== '' && Number.isFinite(Number(count))) return [Number(count)];
      if (!round.votosFinales && !round.rescatesFinales) return [];
      const votes = [...Object.values(round.votosFinales || {}),...Object.values(round.rescatesFinales || {})];
      return [votes.reduce((sum,value)=>sum+(Number(value) || 0),0)];
    });
    const total = counts.reduce((sum,n)=>sum+n,0);
    const average = counts.length ? (total/counts.length).toLocaleString('es-AR',{maximumFractionDigits:1}) : '—';
    const metrics = [
      [rounds.length,'Rondas resueltas'],
      [counts.length || !rounds.length ? total : '—','Participaciones registradas'],
      [average,'Promedio por ronda con datos']
    ];
    const cont=document.getElementById('statsContent');
    cont.innerHTML = safeHTML('<div class="stats-grid">'+metrics.map(([value,name])=>'<div class="stat-box"><div class="stat-value">'+value+'</div><div class="stat-label">'+name+'</div></div>').join('')+'</div>');
  }


  function chequearEmpate() {
    const sec = document.getElementById("sectionEmpate");
    const cerrada = votacionCerrada();
    const yaResuelto = !!ganadorFinalActual || !!ganadorRescateActual;
    if (!cerrada || yaResuelto) { sec.style.display = "none"; return; }
    const emp = obtenerEmpate();
    if (!emp) { sec.style.display = "none"; return; }
    const lista = emp.empatados.map(x => `<div><span class="emp-nombre">${escapeHTML(x.nombre)}</span><span class="emp-votos">${x.votos} votos</span></div>`).join("");
    document.getElementById("empateLista").innerHTML = safeHTML(`<strong>Empate a ${emp.maxVotos} votos:</strong>${lista}`);
    sec.style.display = "block";
    actualizarEmpateEstado();
  }

  function actualizarEmpateEstado() {
    const el = document.getElementById('empateEstado');
    if (!el) return;
    if (rngTriggerAt > 0) {
      const restante = rngTriggerAt - Date.now();
      if (restante > 0) el.textContent = `⏱ Desempate automático en ${Math.ceil(restante / 1000)}s.`;
      else el.textContent = `🎲 Desempate automático en curso...`;
    } else {
      el.textContent = `⏱ Esperando la programación del desempate.`;
    }
  }

  async function forzarRngAhora() {
    if (!isAdmin || !obtenerEmpate() || !votacionCerrada()) return;
    if (!confirm('¿Resolver ahora el empate por dados?')) return;
    try { await settle(db,'force',resetTokenActual); }
    catch (e) { alert(e.message); }
  }
  document.getElementById('btnResolverRng').onclick = forzarRngAhora;
  let closing = false;
  setInterval(async () => {
    if (!isAdmin || closing || !votacionCerrada() || ganadorRescateActual || ganadorFinalActual || rngTriggerAt > now() || !Object.values(votosActuales).some(n=>n>0)) return;
    closing = true;
    try { await settle(db,'auto',resetTokenActual); } catch (e) { console.warn(e.message); }
    finally { closing = false; }
  },3000);

  async function accionAplicarCd() {
    if (!isAdmin) return;
    const marcados = [...document.querySelectorAll("#cdDisponibles input:checked")].map(i => i.value);
    if (marcados.length === 0) { alert("Marca al menos un personaje disponible."); return; }
    const dias = Number(document.getElementById("inputCdDias").value);
    if (!Number.isInteger(dias) || dias < 1 || dias > 3650) { alert("Días inválidos."); return; }
    if (!confirm(`Aplicar CD de ${dias} días a:\n\n${marcados.join("\n")}\n\n¿Continuar?`)) return;
    const ahora = Date.now();
    const hasta = ahora + dias * 24 * 60 * 60 * 1000;
    try {
      await roundWrite(db, async () => Object.fromEntries(marcados.map(nombre => ["cooldowns/"+nombre,{activo:true,desde:ahora,hasta,motivo:"CD manual"}])));
      await agregarLog('cd', 'aplicar', `⏳ CD de ${dias} días aplicado a: ${marcados.join(', ')}`, { dias, personajes: marcados, hasta });
      alert(`✅ CD aplicado a ${marcados.length} personaje(s) durante ${dias} días.`);
    } catch (err) { alert("❌ " + err.message); }
  }

  async function accionResetRescates() {
    if (!isAdmin) return;
    if (!confirm("⚠️ Esto borrará TODOS los votos de rescate y permitirá a los rescatadores votar de nuevo.\n\n¿Continuar?")) return;
    if (!confirm("¿Estás seguro?")) return;
    try {
      await roundWrite(db,async () => ({rescates:null,rescatadores:null}));
      rescatesRevelados.clear();
      await agregarLog('rescate', 'reset', '🗑 Todos los votos de rescate fueron reseteados', {});
      alert("✅ Rescates reseteados.");
    } catch (err) { alert("❌ " + err.message); }
  }

  async function accionReiniciarVotos() {
    if (!isAdmin) return;
    if (!confirm("🔄 REINICIAR VOTOS\n\nEsto hará:\n• Votos normales a 0\n• Borrar los votantes registrados\n• Borrar ganadores y resultados pendientes\n• Abrir la votación sin fecha\n• Limpiar predicciones de la ronda\n\nSE CONSERVAN:\n• Cooldowns, rescates, rescatadores\n• Configuración, roles, historial, stats\n• Usuarios y sus PINs\n\n⚡ Se creará un backup automático antes.\n\n¿Continuar?")) return;
    if (!confirm("¿Estás TOTALMENTE seguro? Esta acción no se puede deshacer (pero tendrás un backup).")) return;

    try {
      await crearBackup('reiniciar_votos', {
        votos:null,votantes:null,predicciones:null,
        'config/reset_token':'v'+now(),'config/fin_votacion':0,'config/mostrar_resultados':false,
        'config/ganador_rescate':'','config/ganador_final':'','config/ganador_metodo':'',
        'config/rng_trigger_at':0,'config/primer_votante':null,'config/predicciones_resueltas_token':null,'config/rng_resultado':null,
      });
      votosRevelados.clear();
      await agregarLog('admin', 'reiniciar_votos', '🔄 Reiniciar Votos ejecutado (backup previo guardado, votos y votantes a 0, CDs y rescates conservados)', {});
      alert("✅ Votos reiniciados.\n\nSe conservaron: cooldowns, rescates, rescatadores, historial, roles, stats y PINs de usuarios.\n💾 Puedes restaurar desde el backup si algo salió mal.");
    } catch (err) { alert("❌ " + err.message); }
  }

  async function accionResetTotal() {
    if (!isAdmin) return;
    if (!confirm("⚠️ RESET TOTAL\n\nEsto pondrá TODOS los votos a 0, borrará CDs, rescates, rescatadores, votantes, ganadores y predicciones.\n\n⚠️ El historial, stats, roles y PINs de usuarios NO se borran.\n\n⚡ Se creará un backup automático antes.\n\n¿Continuar?")) return;
    if (!confirm("¿Estás TOTALMENTE seguro? Esta acción no se puede deshacer (pero tendrás un backup).")) return;

    try {
      await crearBackup('reset_total', {
        votos:null,votantes:null,predicciones:null,
        'config/reset_token':'v'+now(),'config/fin_votacion':0,'config/mostrar_resultados':false,
        'config/ganador_rescate':'','config/ganador_final':'','config/ganador_metodo':'',
        'config/rng_trigger_at':0,'config/primer_votante':null,'config/predicciones_resueltas_token':null,'config/rng_resultado':null,
        cooldowns:null,rescatadores:null,rescates:null,
      });
      votosRevelados.clear();
      rescatesRevelados.clear();
      await agregarLog('admin', 'reset_total', '💥 RESET TOTAL ejecutado (backup previo guardado, votos, CDs, rescates, votantes, ganadores, predicciones — historial, roles, stats y PINs intactos)', {});
      alert("✅ Reset total completado.\n\nSe conservaron: historial, roles, stats y PINs de usuarios.\n💾 Puedes restaurar desde el backup si algo salió mal.");
    } catch (err) { alert("❌ " + err.message); }
  }

  async function accionCerrarAhora() {
    if (!isAdmin || !confirm('¿Cerrar la votación ahora?')) return;
    try { await settle(db,'close',resetTokenActual); alert('Votación cerrada.'); } catch (e) { alert(e.message); }
  }
  async function accionReabrir() {
    if (!isAdmin || !confirm('¿Reabrir la misma ronda? El resultado y los puntos de esta ronda se recalcularán al cerrar. Se conserva el cooldown aplicado.')) return;
    try { await reopen(db); alert('Ronda abierta.'); } catch (e) { alert(e.message); }
  }

  async function accionGuardarFecha() {
    if (!isAdmin) return;
    const val = document.getElementById("inputFecha").value;
    if (!val) { alert("Selecciona fecha y hora."); return; }
    const ts = new Date(val).getTime();
    if (isNaN(ts)) { alert("Fecha inválida."); return; }
    if (ts <= Date.now()) { if (!confirm("⚠️ La fecha ya pasó. La votación se cerrará de inmediato. ¿Continuar?")) return; }
    await roundWrite(db,async () => ({'config/fin_votacion':ts}));
    await agregarLog('admin', 'fecha_limite', `💾 Fecha límite guardada: ${formatearFechaBonita(ts)}`, { fin_votacion: ts });
    alert("✅ Fecha guardada:\n" + formatearFechaBonita(ts));
  }
  async function accionQuitarFecha() {
    if (!isAdmin) return;
    if (!confirm("¿Quitar fecha límite?")) return;
    await roundWrite(db,async () => ({'config/fin_votacion':0}));
    await agregarLog('admin', 'fecha_limite', '🗑 Fecha límite eliminada', {});
    alert("✅ Fecha eliminada.");
  }
  async function accionGuardarMiembros() {
    if (!isAdmin) return;
    const val = Number(document.getElementById("inputMiembros").value);
    if (!Number.isSafeInteger(val) || val < 1) { alert("Número inválido."); return; }
    await roundWrite(db,async () => ({'config/total_miembros':val}));
    await agregarLog('admin', 'miembros', `👥 Total de miembros cambiado a ${val}`, { total_miembros: val });
    alert("✅ Miembros actualizados a " + val);
  }
  async function accionGuardarMensaje() {
    if (!isAdmin) return;
    const val = document.getElementById("inputMensaje").value.trim();
    await set(ref(db, "config/mensaje"), val);
    await agregarLog('admin', 'mensaje', val ? `✏️ Mensaje actualizado: "${val}"` : '🗑 Mensaje borrado', {});
    alert(val ? "✅ Mensaje guardado." : "✅ Mensaje borrado.");
  }
  function accionCerrarSesion() {
    subscriptions.splice(0).forEach(stop => stop());
    isAdmin = false;
    hasRoundConfig = false;
    logsCache = [];
    filtroLogs = 'all';
    logSearch.value = '';
    for (const button of document.querySelectorAll('[data-filtro]')) button.setAttribute('aria-pressed',String(button.dataset.filtro==='all'));
    renderLogs();
    adminDiv.classList.remove("visible");
    loginDiv.classList.remove("hidden");
    keywordInput.value = "";
    loginMsg.textContent = "";
    keywordInput.focus();
  }

  document.getElementById("btnResetTotal").addEventListener("click", accionResetTotal);
  document.getElementById("btnCerrarAhora").addEventListener("click", accionCerrarAhora);
  document.getElementById("btnReabrir").addEventListener("click", accionReabrir);
  document.getElementById("btnReiniciarVotos").addEventListener("click", accionReiniciarVotos);
  document.getElementById("btnGuardarFecha").addEventListener("click", accionGuardarFecha);
  document.getElementById("btnQuitarFecha").addEventListener("click", accionQuitarFecha);
  document.getElementById("btnGuardarMiembros").addEventListener("click", accionGuardarMiembros);
  document.getElementById("btnGuardarMensaje").addEventListener("click", accionGuardarMensaje);
  document.getElementById("btnCerrarSesion").addEventListener("click", accionCerrarSesion);
  document.getElementById("btnAplicarCd").addEventListener("click", accionAplicarCd);
  document.getElementById("btnResetRescates").addEventListener("click", accionResetRescates);

  document.getElementById("inputCdDias").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    if (!Number.isInteger(v) || v < 1 || v > 3650) { alert("Elegí entre 1 y 3650 días."); return; }
    if (isAdmin) roundWrite(db,async () => ({"config/cd_dias":v})).catch(e => alert(e.message));
  });
  document.getElementById("inputAutoCd").addEventListener("change", async (e) => {
    if (!isAdmin) return;
    const checked = e.target.checked;
    await roundWrite(db,async () => ({"config/auto_cd_activo":checked}));
    await agregarLog('admin', 'auto_cd_toggle', e.target.checked ? '☑ Auto-CD activado' : '☐ Auto-CD desactivado', { activo: e.target.checked });
  });

  setInterval(() => { if (isAdmin) { renderRoundStatus(); actualizarEmpateEstado(); } }, 1000);
  setInterval(() => { if (isAdmin) renderCdSection(); }, 60000);
