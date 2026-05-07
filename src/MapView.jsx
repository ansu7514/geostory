import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { CAT_COLORS, TILE_LAYERS, mercatorToLatLng, latLngToMercator, genId } from './constants';

// ── ImageOverlayPanel ─────────────────────────────────────
function ImageOverlayPanel({ mapRef, resetTrigger }) {
  const [overlays, setOverlays] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [placing, setPlacing] = useState(null);
  const [loading, setLoading] = useState(null);
  const [bounds, setBounds] = useState({ n: '', s: '', e: '', w: '' });
  const [eyedroppingId, setEyedroppingId] = useState(null);
  const [tolerance, setTolerance] = useState(30);
  const fileRef = useRef(null);
  const layerRefs = useRef({});
  const rasterRefs = useRef({});

  useEffect(() => {
    if (!resetTrigger || !mapRef.current) return;
    Object.values(layerRefs.current).forEach((layer) => {
      try {
        mapRef.current.removeLayer(layer);
      } catch {
        /* ignore */
      }
    });
    layerRefs.current = {};
    rasterRefs.current = {};
    setOverlays([]);
    setPlacing(null);
    setLoading(null);
    setEyedroppingId(null);
  }, [resetTrigger, mapRef]);

  const loadFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['tif', 'tiff'].includes(ext)) {
      loadGeoTIFF(file);
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const url = URL.createObjectURL(file);
      setPlacing({ url, name: file.name });
    }
  };

  const buildRasterLayer = useCallback(
    (raster, GeoRasterLayer, transparentColor = null, tol = 30) => {
      return new GeoRasterLayer({
        georaster: raster,
        opacity: 1,
        resolution: 256,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 0,
        pixelValuesToColorFn: (values) => {
          if (!values || values.every((v) => v == null)) return null;
          const isMono = raster.numberOfRasters < 3;
          const r = Math.round(values[0] ?? 0);
          const g = Math.round(isMono ? values[0] : (values[1] ?? 0));
          const b = Math.round(isMono ? values[0] : (values[2] ?? 0));
          if (transparentColor) {
            const diff =
              Math.abs(r - transparentColor.r) +
              Math.abs(g - transparentColor.g) +
              Math.abs(b - transparentColor.b);
            if (diff < tol * 3) return null;
          }
          const a = raster.numberOfRasters >= 4 ? (values[3] ?? 255) : 255;
          return `rgba(${r},${g},${b},${a / 255})`;
        },
      });
    },
    [],
  );

  const loadGeoTIFF = async (file) => {
    setLoading('GeoTIFF 로딩 중...');
    try {
      const [georaster, GeoRasterLayer] = await Promise.all([
        import('georaster').then((m) => m.default ?? m),
        import('georaster-layer-for-leaflet').then((m) => m.default ?? m),
      ]);
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsArrayBuffer(file);
      });
      setLoading('GeoTIFF 렌더링 중...');
      const raster = await georaster(arrayBuffer);

      const isWebMercator = raster.projection === 3857 || raster.xmin > 1000 || raster.xmin < -1000;
      const sw = isWebMercator
        ? mercatorToLatLng(raster.xmin, raster.ymin)
        : [raster.ymin, raster.xmin];
      const ne = isWebMercator
        ? mercatorToLatLng(raster.xmax, raster.ymax)
        : [raster.ymax, raster.xmax];

      const id = genId();
      const layer = buildRasterLayer(raster, GeoRasterLayer);
      layer.addTo(mapRef.current);
      mapRef.current.fitBounds([sw, ne], { padding: [40, 40] });

      layerRefs.current[id] = layer;
      rasterRefs.current[id] = {
        raster,
        GeoRasterLayer,
        isWebMercator,
        transparentColor: null,
        tolerance: 30,
      };

      setOverlays((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          type: 'GeoTIFF',
          visible: true,
          opacity: 0.8,
          transparentColor: null,
        },
      ]);
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
    const id = genId();
    const layer = L.imageOverlay(
      placing.url,
      [
        [s, w],
        [n, e],
      ],
      { opacity: 0.85, interactive: true },
    );
    layer.addTo(mapRef.current);
    mapRef.current.fitBounds(
      [
        [s, w],
        [n, e],
      ],
      { padding: [40, 40] },
    );
    layerRefs.current[id] = layer;
    setOverlays((prev) => [
      ...prev,
      { id, name: placing.name, type: '이미지', visible: true, opacity: 0.85 },
    ]);
    setPlacing(null);
    setBounds({ n: '', s: '', e: '', w: '' });
  };

  const useMapBounds = () => {
    const b = mapRef.current.getBounds();
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
        if (o.visible) mapRef.current.removeLayer(layer);
        else layer.addTo(mapRef.current);
        return { ...o, visible: !o.visible };
      }),
    );
  };

  // GeoTIFF는 레이어 재생성, 일반 이미지는 setOpacity
  const changeOpacity = (id, val) => {
    const ref = rasterRefs.current[id];
    if (ref) {
      const oldLayer = layerRefs.current[id];
      if (oldLayer) mapRef.current.removeLayer(oldLayer);
      const newLayer = buildRasterLayer(
        ref.raster,
        ref.GeoRasterLayer,
        ref.transparentColor,
        ref.tolerance ?? 30,
      );
      newLayer.setOpacity(val);
      newLayer.addTo(mapRef.current);
      layerRefs.current[id] = newLayer;
    } else {
      const layer = layerRefs.current[id];
      if (layer?.setOpacity) layer.setOpacity(val);
    }
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, opacity: val } : o)));
  };

  const removeOverlay = (id) => {
    const layer = layerRefs.current[id];
    if (layer) {
      mapRef.current.removeLayer(layer);
      delete layerRefs.current[id];
    }
    delete rasterRefs.current[id];
    if (eyedroppingId === id) {
      setEyedroppingId(null);
      mapRef.current.off('click');
      mapRef.current.getContainer().style.cursor = '';
    }
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  };

  const applyTransparentColor = useCallback(
    (id, color, tol) => {
      const ref = rasterRefs.current[id];
      if (!ref) return;
      const oldLayer = layerRefs.current[id];
      if (oldLayer) mapRef.current.removeLayer(oldLayer);
      const newLayer = buildRasterLayer(ref.raster, ref.GeoRasterLayer, color, tol);
      const currentOpacity = overlays.find((o) => o.id === id)?.opacity ?? 0.8;
      newLayer.setOpacity(currentOpacity);
      newLayer.addTo(mapRef.current);
      layerRefs.current[id] = newLayer;
      rasterRefs.current[id] = { ...ref, transparentColor: color, tolerance: tol };
      setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, transparentColor: color } : o)));
    },
    [buildRasterLayer, overlays, mapRef],
  );

  const startEyedropper = (id) => {
    setEyedroppingId(id);
    mapRef.current.getContainer().style.cursor = 'crosshair';
    mapRef.current.once('click', (e) => {
      const ref = rasterRefs.current[id];
      if (!ref) return;
      const { raster, isWebMercator } = ref;
      let px, py;
      if (isWebMercator) {
        [px, py] = latLngToMercator(e.latlng.lat, e.latlng.lng);
      } else {
        px = e.latlng.lng;
        py = e.latlng.lat;
      }
      const col = Math.floor((px - raster.xmin) / raster.pixelWidth);
      const row = Math.floor((raster.ymax - py) / raster.pixelHeight);
      if (col < 0 || row < 0 || col >= raster.width || row >= raster.height) {
        setEyedroppingId(null);
        mapRef.current.getContainer().style.cursor = '';
        return;
      }
      const values = raster.values.map((band) => band[row]?.[col] ?? 0);
      const isMono = raster.numberOfRasters < 3;
      const color = {
        r: Math.round(values[0] ?? 0),
        g: Math.round(isMono ? values[0] : (values[1] ?? 0)),
        b: Math.round(isMono ? values[0] : (values[2] ?? 0)),
      };
      applyTransparentColor(id, color, tolerance);
      setEyedroppingId(null);
      mapRef.current.getContainer().style.cursor = '';
    });
  };

  const cancelEyedropper = () => {
    setEyedroppingId(null);
    mapRef.current.off('click');
    mapRef.current.getContainer().style.cursor = '';
  };

  const s = {
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
    inp: {
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
    btn: (primary, warn) => ({
      padding: '2px 7px',
      borderRadius: 5,
      fontSize: 10,
      cursor: 'pointer',
      border: `1px solid ${warn ? 'var(--warn)' : primary ? 'var(--accent)' : 'var(--border)'}`,
      background: warn ? 'rgba(251,191,36,0.15)' : primary ? 'var(--accent)' : 'var(--bg3)',
      color: warn ? 'var(--warn)' : primary ? '#fff' : 'var(--text)',
      fontFamily: 'inherit',
    }),
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={s.title}>이미지 오버레이</div>
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
        🛩️ 드론/항공사진 또는 GeoTIFF
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

      {loading && (
        <div
          style={{
            marginTop: 8,
            padding: '9px 12px',
            background: 'rgba(79,124,255,0.1)',
            border: '1px solid rgba(79,124,255,0.3)',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--accent)',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
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
            📍 &quot;{placing.name}&quot; 위치 설정
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
            {[
              ['n', '북위(상단)'],
              ['s', '남위(하단)'],
              ['e', '동경(우측)'],
              ['w', '서경(좌측)'],
            ].map(([k, label]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
                <input
                  style={s.inp}
                  placeholder="37.xxx"
                  value={bounds[k]}
                  onChange={(ev) => setBounds((p) => ({ ...p, [k]: ev.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={useMapBounds} style={{ ...s.btn(false), padding: '5px 8px' }}>
              현재 범위
            </button>
            <button onClick={placeImageOverlay} style={{ ...s.btn(true), padding: '5px 8px' }}>
              올리기
            </button>
            <button
              onClick={() => setPlacing(null)}
              style={{
                ...s.btn(false),
                padding: '5px 8px',
                color: 'var(--danger)',
                borderColor: 'var(--danger)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
                  marginRight: 4,
                  color: 'var(--text2)',
                }}
              >
                {o.type}
              </span>
              {o.name}
            </div>
            <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 5 }}>
              {o.type === 'GeoTIFF' && (
                <button
                  onClick={() =>
                    eyedroppingId === o.id ? cancelEyedropper() : startEyedropper(o.id)
                  }
                  title="스포이드: 클릭한 색상 투명 처리"
                  style={s.btn(false, eyedroppingId === o.id)}
                >
                  {eyedroppingId === o.id ? '취소' : '🔬'}
                </button>
              )}
              <button onClick={() => toggleOverlay(o.id)} style={s.btn(false)}>
                {o.visible ? '숨김' : '표시'}
              </button>
              <button
                onClick={() => removeOverlay(o.id)}
                style={{ ...s.btn(false), color: 'var(--danger)' }}
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

          {o.type === 'GeoTIFF' && o.transparentColor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)' }}>허용오차</span>
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={tolerance}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setTolerance(val);
                  applyTransparentColor(o.id, o.transparentColor, val);
                }}
                style={{ flex: 1, accentColor: 'var(--warn)' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text2)', width: 22 }}>{tolerance}</span>
              <div
                title={`rgb(${o.transparentColor.r},${o.transparentColor.g},${o.transparentColor.b})`}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  flexShrink: 0,
                  background: `rgb(${o.transparentColor.r},${o.transparentColor.g},${o.transparentColor.b})`,
                }}
              />
            </div>
          )}

          {eyedroppingId === o.id && (
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: 'var(--warn)',
                textAlign: 'center',
                padding: '4px 0',
              }}
            >
              🔬 지도에서 투명하게 할 색상을 클릭하세요
            </div>
          )}
        </div>
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const PALETTE = [
  '#4f7cff',
  '#4ade80',
  '#fbbf24',
  '#f87171',
  '#c084fc',
  '#34d399',
  '#fb923c',
  '#60a5fa',
  '#f472b6',
  '#a78bfa',
  '#2dd4bf',
  '#86efac',
];

// ── MapView ───────────────────────────────────────────────
export default function MapView({
  rows,
  cols,
  vizType,
  layerType,
  onLayerChange,
  resetTrigger,
  colorCol,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const markersRef = useRef([]);
  const overlayPanelRef = useRef({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (mapRef.current) return;
    const m = L.map(containerRef.current, { zoomControl: false }).setView([37.5, 127.0], 7);
    L.control.zoom({ position: 'topright' }).addTo(m);
    tileRef.current = L.tileLayer(TILE_LAYERS.dark, { attribution: '', maxZoom: 19 }).addTo(m);
    mapRef.current = m;
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(TILE_LAYERS[layerType] ?? TILE_LAYERS.dark, {
      attribution: '',
      maxZoom: 19,
    }).addTo(mapRef.current);
    setTimeout(() => {
      if (!overlayPanelRef.current) return;
      Object.values(overlayPanelRef.current).forEach((layer) => {
        try {
          layer.bringToFront();
        } catch {
          /* empty */
        }
      });
    }, 100);
  }, [layerType]);

  const colorMap = useMemo(() => {
    if (!colorCol) return {};
    const map = {};
    rows.forEach((r) => {
      const val = String(r[colorCol] ?? '');
      if (val && !map[val]) map[val] = PALETTE[Object.keys(map).length % PALETTE.length];
    });
    return map;
  }, [rows, colorCol]);

  const getColor = useCallback(
    (row) => {
      if (colorCol && row[colorCol] != null && row[colorCol] !== '') {
        return colorMap[String(row[colorCol])] ?? CAT_COLORS.default;
      }
      const cat = row.category ?? row.type ?? row.분류 ?? row.카테고리 ?? 'default';
      return CAT_COLORS[cat] ?? CAT_COLORS.default;
    },
    [colorCol, colorMap],
  );

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((mk) => mapRef.current.removeLayer(mk));
    markersRef.current = [];
    if (!cols.lat || !cols.lng || !rows.length) return;

    const bounds = [];
    rows.forEach((row) => {
      const lat = parseFloat(row[cols.lat]);
      const lng = parseFloat(row[cols.lng]);
      if (isNaN(lat) || isNaN(lng)) return;
      const color = getColor(row);

      if (vizType === 'heatmap') {
        const c = L.circleMarker([lat, lng], {
          radius: 22,
          fillColor: color,
          color: 'transparent',
          fillOpacity: 0.12,
        }).addTo(mapRef.current);
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
        `<div style="min-width:170px">${entries.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:14px;padding:3px 0;border-bottom:0.5px solid #2e3350;font-size:11px"><span style="color:#8892b0;flex-shrink:0">${k}</span><span style="color:#e8eaf6;text-align:right;word-break:break-all">${v}</span></div>`).join('')}</div>`,
      );
      mk.addTo(mapRef.current);
      markersRef.current.push(mk);
      bounds.push([lat, lng]);
    });

    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
  }, [rows, cols, vizType, getColor]);

  const cats = colorCol
    ? [
        ...new Set(
          rows.map((r) => r[colorCol]).filter((v) => v !== null && v !== undefined && v !== ''),
        ),
      ].slice(0, 12)
    : [...new Set(rows.map((r) => r.category ?? r.type ?? r.분류 ?? r.카테고리).filter(Boolean))];

  const getCatColor = (c) =>
    colorCol ? (colorMap[String(c)] ?? CAT_COLORS.default) : (CAT_COLORS[c] ?? CAT_COLORS.default);

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ width: '100%', flex: 1 }} />

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
                  background: getCatColor(c),
                  flexShrink: 0,
                }}
              />
              {c}
            </div>
          ))}
        </div>
      )}

      {mapReady && (
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
            width: 270,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <ImageOverlayPanel mapRef={mapRef} resetTrigger={resetTrigger} />
        </div>
      )}
    </div>
  );
}
