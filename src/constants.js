export const CAT_COLORS = {
  랜드마크: '#4f7cff',
  광장: '#4ade80',
  관광: '#fbbf24',
  유적: '#f87171',
  문화: '#c084fc',
  공원: '#34d399',
  상업: '#fb923c',
  교통: '#60a5fa',
  음식: '#f472b6',
  숙박: '#a78bfa',
  의료: '#2dd4bf',
  교육: '#86efac',
  default: '#8892b0',
};

export const TILE_LAYERS = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

export function mercatorToLatLng(x, y) {
  const lng = (x / 20037508.342) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2);
  return [lat, lng];
}

export function latLngToMercator(lat, lng) {
  const x = (lng * 20037508.342) / 180;
  const y =
    ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.342) / 180;
  return [x, y];
}

let _idCounter = 0;
export function genId() {
  _idCounter += 1;
  return `overlay_${_idCounter}`;
}
