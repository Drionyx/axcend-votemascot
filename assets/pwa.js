(() => {
  const button = document.querySelector('.install');
  if (!/^https?:$/.test(location.protocol) || !window.isSecureContext) { if (button) button.hidden = true; return; }
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt;
  const setButton = () => { if (button) button.hidden = installed() || !(prompt || ios); };
  setButton();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    setButton();
  });
  window.addEventListener('appinstalled', () => { prompt = null; if (button) button.hidden = true; });
  button?.addEventListener('click', async () => {
    if (prompt) {
      const current = prompt;
      prompt = null;
      await current.prompt();
      await current.userChoice;
      setButton();
    } else if (ios) {
      const dialog = document.createElement('dialog');
      dialog.className = 'install-dialog';
      dialog.innerHTML = '<h2>Instalar WOOFIA XXL</h2><p>En Safari, abrí Compartir, elegí Agregar a inicio y confirmá en Agregar.</p><form method="dialog"><button>Cerrar</button></form>';
      dialog.addEventListener('close', () => dialog.remove(), {once:true});
      document.body.append(dialog);
      dialog.showModal();
    }
  });
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(reg => {
    let accepted = false;
    let offered;
    const offer = () => {
      if (!navigator.serviceWorker.controller || !reg.waiting || offered) return;
      offered = document.createElement('div');
      offered.className = 'update-note';
      offered.setAttribute('role','status');
      offered.textContent = 'Hay una nueva versión de WOOFIA XXL.';
      const action = document.createElement('button');
      action.textContent = 'Actualizar';
      action.onclick = () => { accepted = true; reg.waiting?.postMessage('ACTIVATE'); };
      offered.append(action);
      document.body.prepend(offered);
    };
    offer();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', offer));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (accepted) location.reload();
      else offered?.remove();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(err => console.warn('Instalación de la app:', err));
})();
