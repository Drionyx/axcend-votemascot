import {session} from './client.js';

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const active = new Set();

export function animate(element, frames, duration) {
  if (!element?.animate || reducedMotion.matches || document.hidden) return;
  const animation = element.animate(frames, {duration, easing:'cubic-bezier(.2,.75,.24,1)'});
  active.add(animation);
  const done = () => active.delete(animation);
  animation.addEventListener('finish', done, {once:true});
  animation.addEventListener('cancel', done, {once:true});
  return animation;
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) for (const animation of active) animation.cancel();
});

// La ceremonia empieza al ver el podio; las actualizaciones de datos conservan su tarjeta.
let releasePodium;
export function stopWatchingAward() { releasePodium?.(); releasePodium = null; }
export function presentAward(card, key) {
  stopWatchingAward();
  if (session.getItem('woofia_award_seen') === key) return;
  let inView = !('IntersectionObserver' in window);
  const overlays = document.querySelectorAll('dialog,[role="dialog"],#diceOverlay,#maintenanceOverlay,#lightbox');
  const reveal = () => {
    if (!inView || !card.isConnected || document.hidden || [...overlays].some(el => el.getClientRects().length)) return;
    stopWatchingAward();
    session.setItem('woofia_award_seen', key);
    if (reducedMotion.matches) return;
    const settle = event => {
      if (event.animationName !== 'award-sheen') return;
      card.classList.remove('awarding');
      card.removeEventListener('animationend', settle);
      card.removeEventListener('animationcancel', settle);
    };
    card.addEventListener('animationend', settle);
    card.addEventListener('animationcancel', settle);
    card.classList.add('awarding');
  };
  const covers = new MutationObserver(reveal);
  overlays.forEach(el => covers.observe(el,{attributes:true,attributeFilter:['class','style','open']}));
  const viewport = inView ? null : new IntersectionObserver(entries => {
    inView = entries[entries.length-1].intersectionRatio >= .15;
    reveal();
  }, {threshold:.15});
  document.addEventListener('visibilitychange',reveal);
  releasePodium = () => {
    viewport?.disconnect();
    covers.disconnect();
    document.removeEventListener('visibilitychange',reveal);
  };
  viewport?.observe(card);
  reveal();
}

export function updateMedals(row, badges) {
  if (!badges.length) {
    const empty = 'Tus medallas aparecerán aquí.';
    if (row.textContent !== empty) row.textContent = empty;
    return;
  }
  if (!row.firstElementChild) row.replaceChildren();
  const byType = new Map(Array.from(row.children, node => [node.dataset.medal, node]));
  badges.forEach((badge, index) => {
    const existing = byType.get(badge.cls);
    const chip = existing || document.createElement('span');
    byType.delete(badge.cls);
    if (!existing) {
      chip.className = 'badge-chip ' + badge.cls;
      chip.dataset.medal = badge.cls;
    }
    if (row.children[index] !== chip) row.insertBefore(chip, row.children[index] || null);
    if (chip.textContent !== badge.text) {
      chip.textContent = badge.text;
      if (badge.icon) {
        const icon=document.createElement('img');
        icon.src=badge.icon;icon.alt='';chip.prepend(icon);
      }
      animate(chip, [
        {opacity:.55, transform:'translateY(3px) scale(.96)'},
        {opacity:1, transform:'translateY(-1px) scale(1.035)', offset:.6},
        {opacity:1, transform:'none'}
      ], 420);
    }
    chip.title = badge.title;
  });
  for (const node of byType.values()) node.remove();
}

