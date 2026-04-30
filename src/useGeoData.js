import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const LAT_RX = /^(lat|latitude|위도|y_coord|lat_wgs|y|위도좌표|중심위도|lat_dd)$/i;
const LNG_RX = /^(lon|lng|longitude|경도|x_coord|lon_wgs|x|경도좌표|중심경도|lng_dd|long)$/i;
const ADDR_RX = /주소|address|addr|도로명|지번|소재지|위치|장소명|location/i;
const NAME_RX = /^(name|명칭|이름|지점|시설명|상호|업체명|건물명|title|장소명|사업장명)$/i;
const CAT_RX = /^(category|type|분류|카테고리|업종|종류|구분|업태|시설구분|유형)$/i;

export function detectColumns(fields) {
  return {
    lat: fields.find((f) => LAT_RX.test(f)) || null,
    lng: fields.find((f) => LNG_RX.test(f)) || null,
    addr: fields.find((f) => ADDR_RX.test(f)) || null,
    name: fields.find((f) => NAME_RX.test(f)) || null,
    category: fields.find((f) => CAT_RX.test(f)) || null,
  };
}

function flattenObject(obj, prefix = '', maxDepth = 2, depth = 0) {
  if (!obj || typeof obj !== 'object') return { [prefix || 'value']: obj };
  if (depth >= maxDepth) return { [prefix]: JSON.stringify(obj) };
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(acc, flattenObject(v, key, maxDepth, depth + 1));
    } else if (Array.isArray(v)) {
      acc[key] = v.join(', ');
    } else {
      acc[key] = v;
    }
    return acc;
  }, {});
}

function parseGeoJSON(json) {
  const features =
    json.type === 'FeatureCollection' ? json.features : json.type === 'Feature' ? [json] : [];
  return features.map((f) => {
    const props = flattenObject(f.properties || {});
    const geom = f.geometry;
    if (!geom) return props;
    if (geom.type === 'Point') {
      props._lat = geom.coordinates[1];
      props._lng = geom.coordinates[0];
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const lats = coords.map((c) => c[1]),
        lngs = coords.map((c) => c[0]);
      props._lat = lats.reduce((a, b) => a + b, 0) / lats.length;
      props._lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      props._geomType = geom.type;
    } else if (geom.type === 'LineString') {
      const mid = Math.floor(geom.coordinates.length / 2);
      props._lat = geom.coordinates[mid][1];
      props._lng = geom.coordinates[mid][0];
    }
    return props;
  });
}

function parseJSON(json) {
  const arr = Array.isArray(json)
    ? json
    : (Object.values(json).find((v) => Array.isArray(v)) ?? [json]);
  return arr.map((item) =>
    typeof item === 'object' && item !== null ? flattenObject(item) : { value: item },
  );
}

function countMapped(data, c) {
  if (!c.lat || !c.lng) return 0;
  return data.filter((r) => {
    const la = parseFloat(r[c.lat]),
      lo = parseFloat(r[c.lng]);
    return !isNaN(la) && !isNaN(lo);
  }).length;
}

export function useGeoData() {
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState({ lat: null, lng: null, addr: null });
  const [fileName, setFileName] = useState('');
  const [mappedCount, setMappedCount] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });
  const [fileType, setFileType] = useState('');
  const [error, setError] = useState(null);
  const cacheRef = useRef({});

  const geocodeAll = useCallback(async (data, addrCol, onUpdate) => {
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: data.length });
    let done = 0;
    for (let i = 0; i < data.length; i++) {
      const addr = String(data[i][addrCol] || '').trim();
      if (!addr) {
        done++;
        continue;
      }
      if (cacheRef.current[addr]) {
        data[i]._lat = cacheRef.current[addr].lat;
        data[i]._lng = cacheRef.current[addr].lng;
      } else {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&accept-language=ko`;
          const res = await fetch(url, { headers: { 'User-Agent': 'GeoStory/1.0' } });
          const json = await res.json();
          if (json.length) {
            data[i]._lat = parseFloat(json[0].lat);
            data[i]._lng = parseFloat(json[0].lon);
            cacheRef.current[addr] = { lat: data[i]._lat, lng: data[i]._lng };
          }
          await new Promise((r) => setTimeout(r, 220));
        } catch {
          /* ignore geocode error for this address */
        }
      }
      done++;
      setGeocodeProgress({ done, total: data.length });
      if (i % 5 === 0) onUpdate?.([...data]);
    }
    setGeocoding(false);
    return data;
  }, []);

  const finalize = useCallback(
    async (data, name, ext, detectedCols) => {
      setError(null);
      let c = { ...detectedCols };
      let finalData = [...data];

      if ((ext === 'geojson' || ext === 'json') && data.some((r) => r._lat !== undefined)) {
        c.lat = '_lat';
        c.lng = '_lng';
      }

      if ((!c.lat || !c.lng) && c.addr) {
        finalData = await geocodeAll(finalData, c.addr, (updated) => {
          const tmpC = { ...c, lat: '_lat', lng: '_lng' };
          setRows([...updated]);
          setCols(tmpC);
          setMappedCount(countMapped(updated, tmpC));
        });
        c = { ...c, lat: '_lat', lng: '_lng' };
      }

      setRows(finalData);
      setCols(c);
      setFileName(name);
      setFileType(ext);
      setMappedCount(countMapped(finalData, c));
    },
    [geocodeAll],
  );

  const processFile = useCallback(
    (file) => {
      setError(null);
      const ext = file.name.split('.').pop().toLowerCase();
      setFileType(ext);

      if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (r) => finalize(r.data, file.name, ext, detectColumns(r.meta.fields)),
        });
      } else if (ext === 'tsv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          delimiter: '\t',
          complete: (r) => finalize(r.data, file.name, ext, detectColumns(r.meta.fields)),
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (data.length) finalize(data, file.name, ext, detectColumns(Object.keys(data[0])));
        };
        reader.readAsBinaryString(file);
      } else if (ext === 'json' || ext === 'geojson') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target.result);
            let data, c;
            if (json.type === 'FeatureCollection' || json.type === 'Feature') {
              data = parseGeoJSON(json);
              c = detectColumns(Object.keys(data[0] || {}));
              c.lat = '_lat';
              c.lng = '_lng';
            } else {
              data = parseJSON(json);
              c = detectColumns(Object.keys(data[0] || {}));
            }
            finalize(data, file.name, ext, c);
          } catch (err) {
            setError('JSON 파싱 오류: ' + err.message);
          }
        };
        reader.readAsText(file);
      } else {
        setError(`지원하지 않는 형식: .${ext}`);
      }
    },
    [finalize],
  );

  const loadDirect = useCallback(
    (data, name, detectedCols) => {
      finalize(data, name, 'csv', detectedCols);
    },
    [finalize],
  );

  const reset = useCallback(() => {
    setRows([]);
    setCols({ lat: null, lng: null, addr: null });
    setFileName('');
    setMappedCount(0);
    setGeocoding(false);
    setGeocodeProgress({ done: 0, total: 0 });
    setFileType('');
    setError(null);
  }, []);

  return {
    rows,
    cols,
    fileName,
    mappedCount,
    geocoding,
    geocodeProgress,
    fileType,
    error,
    processFile,
    loadDirect,
    reset,
  };
}
