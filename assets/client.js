// Algunos visores móviles restringen el almacenamiento a la pestaña actual.
function storage(name) {
  const memory = new Map();
  let native;
  try {
    native = window[name];
    native.setItem('axcend_storage_probe','1');
    native.removeItem('axcend_storage_probe');
  } catch { native = null; }
  return {
    getItem(key) {
      try { if (native) return native.getItem(key); } catch { native = null; }
      return memory.get(key) ?? null;
    },
    setItem(key,value) {
      memory.set(key,String(value));
      try { native?.setItem(key,String(value)); } catch { native = null; }
    },
    removeItem(key) {
      memory.delete(key);
      try { native?.removeItem(key); } catch { native = null; }
    }
  };
}
export const preferences = storage('localStorage');
export const session = storage('sessionStorage');
export async function pinDigest(text) {
  if (!globalThis.crypto?.subtle) return window.sha256(text);
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
