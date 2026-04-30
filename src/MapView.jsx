import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

const LAYERS = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

const CAT_COLORS = {
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
// ── Image overlay panel ───────────────────────────────────
function ImageOverlayPanel({ map, onImageAdded, resetTrigger }) {
  const [overlays, setOverlays] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [placing, setPlacing] = useState(null); // {url, name, type}
  const [loading, setLoading] = useState(null);
  const [bounds, setBounds] = useState({ n: '', s: '', e: '', w: '' });
  const fileRef = useRef(null);
  const layerRefs = useRef({});

  // 스포이드 관련 state
  const [eyedropper, setEyedropper] = useState(null); // { id, raster, GeoRasterLayer, bounds }
  const [tolerance, setTolerance] = useState(30);
  const rasterRefs = useRef({}); // id → { raster, GeoRasterLayer, sw, ne }

  const loadFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['tif', 'tiff'].includes(ext)) {
      loadGeoTIFF(file);
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const url = URL.createObjectURL(file);
      setPlacing({ url, name: file.name, type: 'image' });
    }
  };

  // EPSG:3857 (Web Mercator) → WGS84 변환
  const mercatorToLatLng = (x, y) => {
    const lng = (x / 20037508.342) * 180;
    const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2);
    return [lat, lng];
  };

  const loadGeoTIFF = async (file) => {
    setLoading('GeoTIFF 로딩 중...');
    try {
      const [georaster, GeoRasterLayer] = await Promise.all([
        import('georaster').then((m) => m.default || m),
        import('georaster-layer-for-leaflet').then((m) => m.default || m),
      ]);
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsArrayBuffer(file);
      });
      setLoading('GeoTIFF 렌더링 중...');
      const raster = await georaster(arrayBuffer);

      // CRS 감지 및 좌표 변환
      const isWebMercator = raster.projection === 3857 || raster.xmin > 1000 || raster.xmin < -1000;

      let sw, ne;
      if (isWebMercator) {
        sw = mercatorToLatLng(raster.xmin, raster.ymin);
        ne = mercatorToLatLng(raster.xmax, raster.ymax);
      } else {
        sw = [raster.ymin, raster.xmin];
        ne = [raster.ymax, raster.xmax];
      }

      const id = crypto.randomUUID();

      const buildLayer = (transparentColor = null, tol = 30) => {
        const layer = new GeoRasterLayer({
          georaster: raster,
          opacity: 0.8,
          resolution: 128,
          pixelValuesToColorFn: (values) => {
            if (!values || values.every((v) => v === null || v === undefined)) return null;
            const [r, g, b] =
              raster.numberOfRasters >= 3
                ? [values[0], values[1], values[2]]
                : [values[0], values[0], values[0]];
            if (transparentColor) {
              const diff =
                Math.abs(r - transparentColor.r) +
                Math.abs(g - transparentColor.g) +
                Math.abs(b - transparentColor.b);
              if (diff < tol * 3) return null;
            }
            const a = raster.numberOfRasters >= 4 ? values[3] : 255;
            return `rgba(${r},${g},${b},${a / 255})`;
          },
        });
        return layer;
      };

      const layer = buildLayer();
      layer.addTo(map);

      const leafletBounds = [sw, ne];
      map.fitBounds(leafletBounds, { padding: [40, 40] });

      layerRefs.current[id] = layer;
      rasterRefs.current[id] = { raster, GeoRasterLayer, sw, ne, buildLayer };
      const newOverlay = { id, name: file.name, type: 'GeoTIFF', visible: true, opacity: 0.8 };

      setOverlays((prev) => [...prev, newOverlay]);
      onImageAdded?.(newOverlay);
    } catch (e) {
      alert('GeoTIFF 로드 오류: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const placeImageOverlay = () => {
    const n = parseFloat(bounds.n),
      s = parseFloat(bounds.s);
    const e = parseFloat(bounds.e),
      w = parseFloat(bounds.w);
    if ([n, s, e, w].some(isNaN)) {
      alert('유효한 좌표를 입력하세요');
      return;
    }
    const leafletBounds = [
      [s, w],
      [n, e],
    ];
    const layer = L.imageOverlay(placing.url, leafletBounds, { opacity: 0.85, interactive: true });
    layer.addTo(map);
    map.fitBounds(leafletBounds, { padding: [40, 40] });

    const id = crypto.randomUUID();
    layerRefs.current[id] = layer;
    const newOverlay = { id, name: placing.name, type: '이미지', visible: true, opacity: 0.85 };
    setOverlays((prev) => [...prev, newOverlay]);
    onImageAdded?.(newOverlay);
    setPlacing(null);
    setBounds({ n: '', s: '', e: '', w: '' });
  };

  const useMapBounds = () => {
    const b = map.getBounds();
    setBounds({
      n: b.getNorth().toFixed(6),
      s: b.getSouth().toFixed(6),
      e: b.getEast().toFixed(6),
      w: b.getWest().toFixed(6),
    });
  };

  const toggleOverlay = (id) => {
    const layer = layerRefs.current[id];
    if (!layer) return;
    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (o.visible) map.removeLayer(layer);
        else layer.addTo(map);
        return { ...o, visible: !o.visible };
      }),
    );
  };

  const changeOpacity = (id, val) => {
    const layer = layerRefs.current[id];
    if (layer?.setOpacity) layer.setOpacity(val);
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, opacity: val } : o)));
  };

  const removeOverlay = (id) => {
    const layer = layerRefs.current[id];
    if (layer) {
      map.removeLayer(layer);
      delete layerRefs.current[id];
    }
    delete rasterRefs.current[id];
    if (eyedropper?.id === id) setEyedropper(null);
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  };

  const applyEyedropper = (id, color) => {
    const ref = rasterRefs.current[id];
    if (!ref) return;
    const oldLayer = layerRefs.current[id];
    if (oldLayer) map.removeLayer(oldLayer);
    const newLayer = ref.buildLayer(color, tolerance);
    newLayer.addTo(map);
    layerRefs.current[id] = newLayer;
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, transparentColor: color } : o)));
    setEyedropper(null);
    map.off('click');
    map.getContainer().style.cursor = '';
  };

  const startEyedropper = (id) => {
    setEyedropper({ id });
    map.getContainer().style.cursor = 'crosshair';
    map.once('click', async (e) => {
      const ref = rasterRefs.current[id];
      if (!ref) return;
      // 클릭 위치 → 픽셀 좌표 변환
      const { raster } = ref;
      const lat = e.latlng.lat,
        lng = e.latlng.lng;
      // Web Mercator 변환
      const x = (lng * 20037508.342) / 180;
      const y =
        ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.342) / 180;
      const isWebMercator = raster.projection === 3857 || raster.xmin > 1000 || raster.xmin < -1000;
      const px = isWebMercator ? x : lng;
      const py = isWebMercator ? y : lat;

      const col = Math.floor((px - raster.xmin) / raster.pixelWidth);
      const row = Math.floor((raster.ymax - py) / raster.pixelHeight);

      if (col < 0 || row < 0 || col >= raster.width || row >= raster.height) {
        setEyedropper(null);
        map.getContainer().style.cursor = '';
        return;
      }

      const values = raster.values.map((band) => band[row]?.[col] ?? 0);
      const color = {
        r: Math.round(values[0] || 0),
        g: Math.round(raster.numberOfRasters >= 3 ? values[1] : values[0]),
        b: Math.round(raster.numberOfRasters >= 3 ? values[2] : values[0]),
      };
      applyEyedropper(id, color);
    });
  };

  // 외부 초기화 트리거 감지
  useEffect(() => {
    if (!resetTrigger) return;
    // 모든 레이어 제거
    Object.values(layerRefs.current).forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch {
        /* layer already removed */
      }
    });
    layerRefs.current = {};
    /* eslint-disable react-hooks/set-state-in-effect */
    setOverlays([]);
    setPlacing(null);
    setLoading(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [resetTrigger, map]);

  const s = {
    section: { marginTop: 10 },
    title: {
      fontSize: 10,
      color: 'var(--text3)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: 6,
      fontWeight: 600,
    },
    dropzone: (active) => ({
      border: `1.5px dashed ${active ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '12px 10px',
      textAlign: 'center',
      cursor: 'pointer',
      background: active ? 'rgba(79,124,255,0.07)' : 'transparent',
      transition: 'all 0.2s',
      fontSize: 11,
      color: 'var(--text2)',
    }),
    input: {
      width: '100%',
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 5,
      padding: '5px 8px',
      fontSize: 11,
      color: 'var(--text)',
      fontFamily: 'monospace',
      outline: 'none',
    },
    btn: (primary) => ({
      padding: '5px 10px',
      borderRadius: 6,
      fontSize: 11,
      cursor: 'pointer',
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--bg3)',
      color: primary ? '#fff' : 'var(--text)',
      fontFamily: 'inherit',
    }),
  };

  return (
    <div style={s.section}>
      <div style={s.title}>이미지 오버레이</div>

      {/* Drop zone */}
      <div
        style={s.dropzone(dragging)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) loadFile(f);
        }}
        onClick={() => fileRef.current?.click()}
      >
        🛩️ 드론/항공사진 또는 GeoTIFF 드래그
        <div style={{ fontSize: 10, marginTop: 3, color: 'var(--text3)' }}>
          JPG · PNG · TIFF · GeoTIFF
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.tif,.tiff"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files[0]) loadFile(e.target.files[0]);
          }}
        />
      </div>

      {/* Loading indicator */}
      {loading && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: 'rgba(79,124,255,0.1)',
            border: '1px solid rgba(79,124,255,0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--accent)',
          }}
        >
          <div
            style={{
              width: 13,
              height: 13,
              border: '2px solid rgba(79,124,255,0.3)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }}
          />
          {loading}
        </div>
      )}

      {/* Bounds input for regular images */}
      {placing && (
        <div
          style={{
            marginTop: 8,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--warn)', marginBottom: 8 }}>
            📍 "{placing.name}" 위치 설정
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
            {[
              ['n', '북위 (상단)'],
              ['s', '남위 (하단)'],
              ['e', '동경 (우측)'],
              ['w', '서경 (좌측)'],
            ].map(([k, label]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
                <input
                  style={s.input}
                  placeholder="37.xxx"
                  value={bounds[k]}
                  onChange={(e) => setBounds((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={useMapBounds} style={s.btn(false)}>
              현재 지도 범위
            </button>
            <button onClick={placeImageOverlay} style={s.btn(true)}>
              지도에 올리기
            </button>
            <button
              onClick={() => setPlacing(null)}
              style={{ ...s.btn(false), color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Overlay list */}
      {overlays.map((o) => (
        <div
          key={o.id}
          style={{
            marginTop: 6,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '8px 10px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 5,
            }}
          >
            <div
              style={{
                fontSize: 11,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontSize: 9,
                  marginRight: 5,
                  color: 'var(--text2)',
                }}
              >
                {o.type}
              </span>
              {o.name}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 6 }}>
              {o.type === 'GeoTIFF' && (
                <button
                  onClick={() =>
                    eyedropper?.id === o.id
                      ? (setEyedropper(null),
                        map.off('click'),
                        (map.getContainer().style.cursor = ''))
                      : startEyedropper(o.id)
                  }
                  title="스포이드: 클릭한 색상 투명 처리"
                  style={{
                    ...s.btn(eyedropper?.id === o.id),
                    padding: '2px 7px',
                    fontSize: 10,
                    background: eyedropper?.id === o.id ? 'var(--warn)' : undefined,
                    borderColor: eyedropper?.id === o.id ? 'var(--warn)' : undefined,
                  }}
                >
                  {eyedropper?.id === o.id ? '클릭 중...' : '🔬'}
                </button>
              )}
              {o.type === 'GeoTIFF' && o.transparentColor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>허용오차</span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={tolerance}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setTolerance(val);
                      applyEyedropper(o.id, o.transparentColor);
                    }}
                    style={{ flex: 1, accentColor: 'var(--warn)' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text2)', width: 28 }}>
                    {tolerance}
                  </span>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      border: '1px solid var(--border)',
                      flexShrink: 0,

                      background: `rgb(${o.transparentColor.r},${o.transparentColor.g},${o.transparentColor.b})`,
                    }}
                  />
                </div>
              )}
              <button
                onClick={() => toggleOverlay(o.id)}
                style={{ ...s.btn(false), padding: '2px 7px', fontSize: 10 }}
              >
                {o.visible ? '숨김' : '표시'}
              </button>
              <button
                onClick={() => removeOverlay(o.id)}
                style={{
                  ...s.btn(false),
                  padding: '2px 7px',
                  fontSize: 10,
                  color: 'var(--danger)',
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>투명도</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={o.opacity}
              onChange={(e) => changeOpacity(o.id, parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text2)', width: 28 }}>
              {Math.round(o.opacity * 100)}%
            </span>
          </div>
        </div>
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ── Main MapView ──────────────────────────────────────────
export default function MapView({ rows, cols, vizType, layerType, onLayerChange, resetTrigger }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileRef = useRef(null);
  const markersRef = useRef([]);
  const [mapInstance, setMapInstance] = useState(null);

  useEffect(() => {
    if (mapInstanceRef.current) return;
    const m = L.map(mapRef.current, { zoomControl: false }).setView([37.5, 127.0], 7);
    L.control.zoom({ position: 'topright' }).addTo(m);
    tileRef.current = L.tileLayer(LAYERS.dark, { attribution: '', maxZoom: 19 }).addTo(m);
    mapInstanceRef.current = m;
    setMapInstance(m);
  }, []);

  useEffect(() => {
    const m = mapInstanceRef.current;
    if (!m || !tileRef.current) return;
    m.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(LAYERS[layerType] || LAYERS.dark, {
      attribution: '',
      maxZoom: 19,
    }).addTo(m);
  }, [layerType]);

  useEffect(() => {
    const m = mapInstanceRef.current;
    if (!m) return;
    markersRef.current.forEach((mk) => m.removeLayer(mk));
    markersRef.current = [];
    if (!cols.lat || !cols.lng || !rows.length) return;

    const bounds = [];
    rows.forEach((row) => {
      const lat = parseFloat(row[cols.lat]),
        lng = parseFloat(row[cols.lng]);
      if (isNaN(lat) || isNaN(lng)) return;

      const cat = row.category || row.type || row.분류 || row.카테고리 || 'default';
      const color = CAT_COLORS[cat] || CAT_COLORS.default;

      if (vizType === 'heatmap') {
        const c = L.circleMarker([lat, lng], {
          radius: 22,
          fillColor: color,
          color: 'transparent',
          fillOpacity: 0.12,
        }).addTo(m);
        markersRef.current.push(c);
      }

      const mk = L.circleMarker([lat, lng], {
        radius: vizType === 'cluster' ? 7 : 8,
        fillColor: color,
        color: vizType === 'cluster' ? 'rgba(255,255,255,0.2)' : '#0f1117',
        weight: vizType === 'cluster' ? 0 : 1.5,
        fillOpacity: vizType === 'cluster' ? 0.65 : 0.9,
      });

      const entries = Object.entries(row)
        .filter(([k]) => !k.startsWith('_'))
        .slice(0, 7);
      mk.bindPopup(
        `<div style="min-width:170px">${entries
          .map(
            ([k, v]) =>
              `<div style="display:flex;justify-content:space-between;gap:14px;padding:3px 0;border-bottom:0.5px solid #2e3350;font-size:11px">
          <span style="color:#8892b0;flex-shrink:0">${k}</span>
          <span style="color:#e8eaf6;text-align:right;word-break:break-all">${v}</span>
        </div>`,
          )
          .join('')}</div>`,
      );
      mk.addTo(m);
      markersRef.current.push(mk);
      bounds.push([lat, lng]);
    });

    if (bounds.length) m.fitBounds(bounds, { padding: [40, 40] });
  }, [rows, cols, vizType]);

  // Legend
  const cats = [
    ...new Set(rows.map((r) => r.category || r.type || r.분류 || r.카테고리).filter(Boolean)),
  ];

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div ref={mapRef} style={{ width: '100%', flex: 1 }} />

      {/* Layer controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          zIndex: 1000,
          display: 'flex',
          gap: 5,
        }}
      >
        {['dark', 'sat', 'street'].map((t) => (
          <button
            key={t}
            onClick={() => onLayerChange(t)}
            style={{
              background: layerType === t ? 'var(--accent)' : 'rgba(26,29,39,0.93)',
              border: `1px solid ${layerType === t ? 'var(--accent)' : 'var(--border)'}`,
              color: layerType === t ? '#fff' : 'var(--text)',
              padding: '5px 11px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              fontFamily: 'inherit',
            }}
          >
            {{ dark: '다크', sat: '위성', street: '일반' }[t]}
          </button>
        ))}
      </div>

      {/* Legend */}
      {cats.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 1000,
            background: 'rgba(26,29,39,0.93)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            padding: '10px 13px',
            minWidth: 130,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--text2)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            범례
          </div>
          {cats.slice(0, 8).map((c) => (
            <div
              key={c}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                marginBottom: 3,
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: CAT_COLORS[c] || CAT_COLORS.default,
                  flexShrink: 0,
                }}
              />
              {c}
            </div>
          ))}
        </div>
      )}

      {/* Image overlay panel — bottom right */}
      {mapInstance && (
        <div
          style={{
            position: 'absolute',
            bottom: 50,
            right: 14,
            zIndex: 1000,
            background: 'rgba(26,29,39,0.96)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            width: 260,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <ImageOverlayPanel map={mapInstance} resetTrigger={resetTrigger} />
        </div>
      )}
    </div>
  );
}
