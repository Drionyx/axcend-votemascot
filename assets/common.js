import {initializeApp} from './vendor/firebase-app.js';
import {getDatabase,onValue,ref,goOnline,goOffline,connectDatabaseEmulator} from './vendor/firebase-database.js';
const config = {
  apiKey:'AIzaSyBaKgNmCCTdFoE2YkU1B4a8AjnwwGFeBJ4',
  authDomain:'axcend-votemascot-fcced.firebaseapp.com',
  databaseURL:'https://axcend-votemascot-fcced-default-rtdb.firebaseio.com',
  projectId:'axcend-votemascot-fcced',
  storageBucket:'axcend-votemascot-fcced.storage.app',
  messagingSenderId:'2042810164',appId:'1:2042810164:web:8880abb1729053ca8a1f61'
};
export const db = getDatabase(initializeApp(config));
if (config.projectId === 'demo-woofia') connectDatabaseEmulator(db,'127.0.0.1',19141);
export function safeHTML(value) { return DOMPurify.sanitize(value,{USE_PROFILES:{html:true},FORBID_TAGS:['form','style','iframe','object','embed']}); }
export function escapeHTML(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const notice = document.createElement('div');
notice.className = 'network-note';
notice.setAttribute('role','status');
notice.hidden = true;
document.body.prepend(notice);
const detail = document.createElement('span');
const retry = document.createElement('button');
retry.type = 'button';
retry.textContent = 'Reintentar';
notice.append(detail,retry);
let connected = false, configIssue = '', timer;
export let roundUnavailable = false;
function setNotice(message) {
  detail.textContent = message;
  notice.hidden = !message;
  roundUnavailable = Boolean(message);
  document.dispatchEvent(new Event('roundconnection'));
}
export function reportConfig(issue='') {
  configIssue = issue;
  if (issue || connected) setNotice(issue);
}
onValue(ref(db,'.info/connected'), snapshot => {
  connected = snapshot.val() === true;
  clearTimeout(timer);
  if (connected) setNotice(configIssue);
  else timer = setTimeout(() => setNotice(configIssue || (document.getElementById('grid') ? 'Sin conexión con la ronda. Podés recorrer los campeones mientras se restablece.' : 'Sin conexión con la ronda. Revisá la conexión para usar el panel.')),1800);
});
retry.addEventListener('click', () => {
  if (configIssue) { location.reload(); return; }
  goOffline(db);
  goOnline(db);
  setNotice('Reintentando la conexión con la ronda…');
});
