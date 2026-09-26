const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

export function formatDate(iso) {
  return dateFmt.format(new Date(iso));
}

export function formatTime(iso) {
  return timeFmt.format(new Date(iso));
}

export function formatVehicle(v) {
  return `${v.year} ${v.make} ${v.model}`;
}

export function formatMiles(n) {
  return `${Number(n).toLocaleString('en-US')} mi`;
}

export function formatHours({ low, high }) {
  return `${low.toFixed(1)}–${high.toFixed(1)} hr`;
}
