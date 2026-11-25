const display = document.getElementById('countdown');
const label = document.getElementById('clockLabel');
const units = ['Días', 'Horas', 'Min', 'Seg'];
let digits = [];

function showStatus(heading, text, state) {
  if (label.textContent !== heading) label.textContent = heading;
  if (display.textContent !== text) display.textContent = text;
  if (digits.length) digits = [];
  if (display.parentElement.dataset.state !== state) display.parentElement.dataset.state = state;
  const title = text + ' · WOOFIA XXL';
  if (document.title !== title) document.title = title;
}

export function renderClock({ganadorRescate, ganadorFinal, ganadorMetodo, resetToken, roundUnavailable, finVotacion, now}) {
  if (ganadorRescate || ganadorFinal) {
    const heading = ganadorRescate ? 'Ganador por rescate' : ganadorMetodo === 'rng' ? 'Ganador por desempate' : 'Ganador de la ronda';
    return showStatus(heading, ganadorRescate || ganadorFinal, 'closed');
  }
  if (!resetToken) return showStatus('Estado de la ronda', roundUnavailable ? 'Ronda sin sincronizar' : 'Conectando con la ronda…', 'pending');
  if (!finVotacion) return showStatus('Estado de la ronda', 'Ronda abierta · Sin fecha límite', 'open');
  const seconds = Math.ceil((finVotacion - now) / 1000);
  if (seconds <= 0) return showStatus('Fin de la ronda', 'Votación cerrada', 'closed');

  if (!digits.length) {
    label.textContent = 'Cierre de votación';
    display.parentElement.dataset.state = 'ticking';
    display.replaceChildren();
    digits = units.map(unit => {
      const cell = document.createElement('span');
      cell.className = 'clock-unit';
      const value = document.createElement('strong');
      const name = document.createElement('small');
      name.textContent = unit;
      cell.append(value, ' ', name);
      display.append(cell, ' ');
      return value;
    });
  }
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0'));
  digits.forEach((digit, i) => { if (digit.textContent !== values[i]) digit.textContent = values[i]; });
  document.title = values[0] + 'd ' + values.slice(1).join(':') + ' · WOOFIA XXL';
}
