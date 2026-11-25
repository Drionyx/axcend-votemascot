export function reserveLimit(config) {
  const limit=config?.sombra_max_lenguetazos;
  return Number.isSafeInteger(limit) && limit>0 ? limit : 1;
}

export function bonusLicks(state) {
  const amount=state?.lamidas_admin;
  return Number.isSafeInteger(amount) && amount>0 ? amount : 0;
}

export function dailyReserve(state, day, limit) {
  const saved=state?.reserva;
  let last=saved?.dia || '';
  let balance=Math.min(limit, Math.max(0,Number.isSafeInteger(saved?.saldo)?saved.saldo:0));
  const spent=state?.ultimoLenguetazo || '';
  // Reconcilia un gasto hecho con la versión anterior, incluso en otra pestaña.
  if (spent && spent>(saved?.gasto || '')) {
    if (spent>last && balance<limit) balance++;
    balance=Math.max(0,balance-1);
    if (spent>last) last=spent;
  }
  // Una visita acredita un solo día, aunque hayan pasado varias fechas.
  if (day>last) {
    last=day;
    if (balance<limit) balance++;
  }
  return {dia:last,saldo:balance,gasto:spent};
}

export function sameReserve(saved,next) {
  return saved?.dia===next.dia && saved.saldo===next.saldo && saved.gasto===next.gasto;
}

