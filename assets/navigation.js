const tablist = document.querySelector('.admin-nav');
if (tablist) {
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  function syncTabs() {
    const active = tabs.find(tab => tab.hash === location.hash) || tabs[0];
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
  }
  function selectTab(tab) {
    if (location.hash !== tab.hash) {
      try { history.pushState(null, '', tab.hash); }
      catch { location.hash = tab.hash; }
    }
    syncTabs();
  }
  tablist.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectTab(tab);
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (panel.getBoundingClientRect().top < tablist.getBoundingClientRect().bottom) panel.scrollIntoView({block:'start'});
  });
  tablist.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const next = {ArrowRight:(index+1)%tabs.length, ArrowLeft:(index+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
  addEventListener('hashchange', syncTabs);
  addEventListener('popstate', syncTabs);
  syncTabs();
}

const dialogs = [...document.querySelectorAll('[role="dialog"]')];
let openDialog, opener;
const controls = dialog => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
function syncDialog() {
  const active = dialogs.find(d => d.getClientRects().length);
  if (active === openDialog) return;
  if (active) {
    if (!openDialog) opener = document.activeElement;
    openDialog = active;
    const first = controls(active)[0];
    if (!active.contains(document.activeElement)) first?.focus({preventScroll:true});
  } else {
    openDialog = null;
    opener?.focus({preventScroll:true});
    opener = null;
  }
}
const observer = new MutationObserver(syncDialog);
dialogs.forEach(d => observer.observe(d,{attributes:true,attributeFilter:['class','style']}));
document.addEventListener('keydown', e => {
  if (!openDialog) return;
  if (e.key === 'Escape') {
    if (openDialog.id === 'modalConfirm') window.cerrarModal?.();
    if (openDialog.id === 'modalPrediccion') window.cerrarModalPrediccion?.();
  }
  if (e.key !== 'Tab') return;
  const items = controls(openDialog);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
