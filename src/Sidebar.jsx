import { useRef, useState } from 'react';
import { detectColumns } from './useGeoData';

const SAMPLE_SETS = {
  서울_랜드마크: [
    { name: '롯데월드타워', lat: 37.5126, lng: 127.1026, category: '랜드마크', visitors: 45000 },
    { name: '광화문광장', lat: 37.5759, lng: 126.9769, category: '광장', visitors: 32000 },
    { name: '북촌한옥마을', lat: 37.5826, lng: 126.9853, category: '관광', visitors: 28000 },
    { name: '경복궁', lat: 37.5796, lng: 126.977, category: '유적', visitors: 55000 },
    { name: '남산타워', lat: 37.5512, lng: 126.9882, category: '랜드마크', visitors: 38000 },
    { name: '인사동', lat: 37.574, lng: 126.9849, category: '문화', visitors: 22000 },
    {
      name: '동대문디자인플라자',
      lat: 37.5669,
      lng: 127.0095,
      category: '랜드마크',
      visitors: 41000,
    },
    { name: '청계천', lat: 37.569, lng: 126.9793, category: '공원', visitors: 25000 },
    { name: '홍대입구', lat: 37.5573, lng: 126.9241, category: '문화', visitors: 60000 },
    { name: '강남역', lat: 37.4979, lng: 127.0276, category: '교통', visitors: 180000 },
    { name: '코엑스', lat: 37.5115, lng: 127.0596, category: '상업', visitors: 85000 },
    { name: '여의도한강공원', lat: 37.5284, lng: 126.9331, category: '공원', visitors: 48000 },
    { name: '수원화성', lat: 37.2863, lng: 127.0137, category: '유적', visitors: 30000 },
    { name: '인천국제공항', lat: 37.4602, lng: 126.4407, category: '교통', visitors: 700000 },
  ],
  전국_편의점: [
    {
      name: 'GS25 강남점',
      lat: 37.4969,
      lng: 127.0274,
      brand: 'GS25',
      district: '강남구',
      sales: 8200000,
    },
    {
      name: 'CU 홍대점',
      lat: 37.5563,
      lng: 126.9228,
      brand: 'CU',
      district: '마포구',
      sales: 7100000,
    },
    {
      name: 'GS25 신촌점',
      lat: 37.5596,
      lng: 126.9374,
      brand: 'GS25',
      district: '서대문구',
      sales: 6800000,
    },
    {
      name: '세븐일레븐 종로점',
      lat: 37.5726,
      lng: 126.9794,
      brand: '7-Eleven',
      district: '종로구',
      sales: 5900000,
    },
    {
      name: 'CU 이태원점',
      lat: 37.5345,
      lng: 126.994,
      brand: 'CU',
      district: '용산구',
      sales: 9200000,
    },
    {
      name: 'GS25 잠실점',
      lat: 37.513,
      lng: 127.1008,
      brand: 'GS25',
      district: '송파구',
      sales: 8800000,
    },
    {
      name: '세븐일레븐 신림점',
      lat: 37.484,
      lng: 126.9294,
      brand: '7-Eleven',
      district: '관악구',
      sales: 5100000,
    },
    {
      name: 'CU 건대점',
      lat: 37.5407,
      lng: 127.0699,
      brand: 'CU',
      district: '광진구',
      sales: 7600000,
    },
    {
      name: 'GS25 부산센텀점',
      lat: 35.1697,
      lng: 129.1304,
      brand: 'GS25',
      district: '해운대구',
      sales: 6300000,
    },
    {
      name: 'CU 대구동성로점',
      lat: 35.8706,
      lng: 128.5945,
      brand: 'CU',
      district: '중구',
      sales: 5700000,
    },
    {
      name: '세븐일레븐 광주충장로점',
      lat: 35.1487,
      lng: 126.9196,
      brand: '7-Eleven',
      district: '동구',
      sales: 4800000,
    },
    {
      name: 'GS25 대전둔산점',
      lat: 36.3509,
      lng: 127.3849,
      brand: 'GS25',
      district: '서구',
      sales: 5200000,
    },
  ],
};

const GEMINI_MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b-latest',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

async function callGemini(apiKey, prompt) {
  const errors = [];
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        const isSkippable =
          res.status === 429 ||
          res.status === 404 ||
          res.status === 400 ||
          msg.includes('quota') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('not found') ||
          msg.includes('deprecated') ||
          msg.includes('free_tier') ||
          msg.includes('limit') ||
          msg.includes('disabled');
        errors.push(`[${model}] ${msg}`);
        if (isSkippable) continue;
        throw new Error(`${model}: ${msg}`);
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) return text;
      errors.push(`[${model}] 빈 응답`);
    } catch (e) {
      errors.push(`[${model}] ${e.message}`);
      const isSkippable =
        e.message?.includes('quota') ||
        e.message?.includes('RESOURCE_EXHAUSTED') ||
        e.message?.includes('not found') ||
        e.message?.includes('free_tier') ||
        e.message?.includes('429');
      if (!isSkippable) throw e;
    }
  }
  throw new Error('모든 모델 실패:\n' + errors.join('\n'));
}

function buildPrompt(rows, cols) {
  const fields = Object.keys(rows[0] || {}).filter((k) => !k.startsWith('_'));
  const catCol = fields.find((f) => /category|type|분류|카테고리|업종|구분|brand/i.test(f));
  const numCols = fields.filter(
    (f) =>
      f !== cols.lat &&
      f !== cols.lng &&
      rows.slice(0, 10).filter((r) => !isNaN(parseFloat(r[f]))).length > 6,
  );
  const catVals = catCol
    ? [...new Set(rows.map((r) => r[catCol]).filter(Boolean))].slice(0, 10)
    : [];
  const sample = rows.slice(0, 10).map((r) => {
    const o = {};
    fields.forEach((k) => {
      o[k] = r[k];
    });
    return o;
  });

  return `당신은 GIS 및 공간 데이터 전문 분석가입니다. 아래 데이터를 분석하고 공간 인사이트를 JSON으로 반환하세요.

데이터 개요:
- 총 ${rows.length}개 레코드, ${fields.length}개 컬럼
- 컬럼 목록: ${fields.join(', ')}
- 수치 컬럼: ${numCols.join(', ') || '없음'}
${catCol ? `- 카테고리(${catCol}): ${catVals.join(', ')}` : ''}

샘플 데이터 (처음 10개):
${JSON.stringify(sample, null, 2)}

아래 JSON 형식으로만 응답하세요 (마크다운/코드블록 없이 순수 JSON):
{
  "summary": "한 줄 핵심 요약 (20자 이내)",
  "insights": [
    {"icon": "이모지", "title": "인사이트 제목", "body": "구체적인 수치와 함께 2~3문장 설명"},
    {"icon": "이모지", "title": "공간 패턴", "body": "지리적 분포 특성과 밀집/분산 패턴 설명"},
    {"icon": "이모지", "title": "핵심 발견", "body": "가장 주목할 만한 데이터 포인트와 이유"},
    {"icon": "💡", "title": "활용 제안", "body": "이 데이터로 할 수 있는 구체적인 업무/비즈니스 활용 방법"}
  ]
}`;
}

export default function Sidebar({
  rows,
  cols,
  fileName,
  mappedCount,
  geocoding,
  geocodeProgress,
  vizType,
  onVizChange,
  onLoadDirect,
  onReset,
  onProcessFile,
  fileType,
  error,
  colorCol,
  onColorColChange,
}) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [insights, setInsights] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeSample, setActiveSample] = useState(null);

  const hasData = rows.length > 0;
  const fields = hasData ? Object.keys(rows[0]).filter((k) => !k.startsWith('_')) : [];

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onProcessFile(f);
  };

  const loadSample = (key) => {
    const data = SAMPLE_SETS[key];
    setActiveSample(key);
    setInsights(null);
    setShareId(null);
    onLoadDirect(data, `${key}.csv`, detectColumns(Object.keys(data[0])));
  };

  const saveKey = (k) => {
    setGeminiKey(k);
    localStorage.setItem('gemini_key', k);
    setShowKeyInput(false);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setInsights(null);
    setAiError(null);
    try {
      if (geminiKey) {
        const prompt = buildPrompt(rows, cols);
        const text = await callGemini(geminiKey, prompt);
        const clean = text.replace(/```json|```/g, '').trim();
        const result = JSON.parse(clean);
        setInsights({ ...result, source: 'gemini' });
      } else {
        await new Promise((r) => setTimeout(r, 700));
        setInsights({ ...analyzeLocally(rows, cols), source: 'local' });
      }
      setShareId(Math.random().toString(36).substr(2, 8));
    } catch (e) {
      setAiError(e.message);
      // fallback to local
      setInsights({ ...analyzeLocally(rows, cols), source: 'local' });
    }
    setAnalyzing(false);
  };

  const copyLink = () => {
    navigator.clipboard
      .writeText(`https://geostory-psi.vercel.app/view/${shareId}`)
      .catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    onReset();
    setInsights(null);
    setShareId(null);
    setAiError(null);
    setActiveSample(null);
  };

  const s = {
    sidebar: {
      width: 340,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg2)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    panel: { padding: '14px 18px', borderBottom: '1px solid var(--border)' },
    panelTitle: {
      fontFamily: 'Syne, sans-serif',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text3)',
      textTransform: 'uppercase',
      letterSpacing: '1.2px',
      marginBottom: 10,
    },
    btn: (primary, small) => ({
      padding: small ? '5px 10px' : '7px 14px',
      borderRadius: 8,
      fontSize: small ? 11 : 13,
      cursor: 'pointer',
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--bg3)',
      color: primary ? '#fff' : 'var(--text)',
      fontFamily: 'inherit',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
    }),
  };

  const FILE_TYPES = ['.csv', '.tsv', '.xlsx', '.xls', '.json', '.geojson'];

  return (
    <div style={s.sidebar}>
      {/* Upload panel */}
      <div style={s.panel}>
        <div style={s.panelTitle}>데이터 업로드</div>

        {!hasData ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                display: 'block',
                border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: '18px 14px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver
                  ? 'rgba(79,124,255,0.07)'
                  : 'linear-gradient(135deg,rgba(79,124,255,0.03),rgba(124,79,255,0.03))',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 5 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>
                파일 드래그 또는 클릭
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                위경도·주소 컬럼 자동 인식 / GeoJSON 지원
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                {FILE_TYPES.map((t) => (
                  <span
                    key={t}
                    style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      color: 'var(--text2)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.json,.geojson"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files[0]) onProcessFile(e.target.files[0]);
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 7,
                  fontSize: 11,
                  color: 'var(--danger)',
                }}
              >
                ⚠ {error}
              </div>
            )}

            {/* Sample data */}
            <div style={{ marginTop: 12 }}>
              <div style={s.panelTitle}>샘플 데이터</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Object.keys(SAMPLE_SETS).map((key) => (
                  <button
                    key={key}
                    onClick={() => loadSample(key)}
                    style={{
                      ...s.btn(false, true),
                      textAlign: 'left',
                      fontSize: 12,
                      background: activeSample === key ? 'rgba(79,124,255,0.1)' : 'var(--bg3)',
                      borderColor: activeSample === key ? 'rgba(79,124,255,0.4)' : 'var(--border)',
                      color: activeSample === key ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    {{ 서울_랜드마크: '🗼 서울 랜드마크', 전국_편의점: '🏪 전국 편의점 매출' }[key]}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(79,124,255,0.1)',
                border: '1px solid rgba(79,124,255,0.25)',
                color: 'var(--accent)',
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--success)',
                  animation: 'pulse 2s infinite',
                  flexShrink: 0,
                }}
              />
              {fileName}
              {fileType && (
                <span
                  style={{
                    background: 'var(--bg3)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontSize: 9,
                    fontFamily: 'monospace',
                    marginLeft: 2,
                  }}
                >
                  .{fileType}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
                marginBottom: 10,
              }}
            >
              {[
                ['레코드', rows.length.toLocaleString()],
                ['컬럼', fields.length],
                ['지도', mappedCount.toLocaleString()],
              ].map(([l, v]) => (
                <div
                  key={l}
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 1 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'Syne, sans-serif' }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 5,
              }}
            >
              <div style={s.panelTitle}>
                컬럼 선택{' '}
                <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(클릭 시 색상 분류)</span>
              </div>
              {colorCol && (
                <button
                  onClick={() => onColorColChange(null)}
                  style={{
                    fontSize: 10,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                  }}
                >
                  초기화
                </button>
              )}
            </div>
            <div style={{ maxHeight: 90, overflowY: 'auto' }}>
              {fields.map((f) => {
                const isGeo = f === cols.lat || f === cols.lng;
                const isAddr = f === cols.addr;
                const isSelected = f === colorCol;
                const isClickable = !isGeo && !isAddr;

                return (
                  <span
                    key={f}
                    onClick={() => isClickable && onColorColChange(isSelected ? null : f)}
                    title={isClickable ? `"${f}" 기준으로 색상 분류` : ''}
                    style={{
                      display: 'inline-block',
                      margin: 2,
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontSize: 10,
                      cursor: isClickable ? 'pointer' : 'default',
                      background: isSelected
                        ? 'rgba(79,124,255,0.15)'
                        : isGeo
                          ? 'rgba(74,222,128,0.1)'
                          : isAddr
                            ? 'rgba(251,191,36,0.1)'
                            : 'var(--bg3)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : isGeo ? 'rgba(74,222,128,0.3)' : isAddr ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
                      color: isSelected
                        ? 'var(--accent)'
                        : isGeo
                          ? 'var(--success)'
                          : isAddr
                            ? 'var(--warn)'
                            : 'var(--text2)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {f}
                    {isSelected && ' ✓'}
                  </span>
                );
              })}
            </div>

            {/* 선택된 컬럼 고유값 미리보기 */}
            {colorCol &&
              (() => {
                const uniqVals = [
                  ...new Set(
                    rows
                      .map((r) => r[colorCol])
                      .filter((v) => v !== null && v !== undefined && v !== ''),
                  ),
                ];
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
                return (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 7,
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>
                      <b style={{ color: 'var(--accent)' }}>{colorCol}</b> 기준 색상 분류 ·{' '}
                      {uniqVals.length}개 값
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {uniqVals.slice(0, 12).map((v, i) => (
                        <div
                          key={v}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            color: 'var(--text2)',
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: PALETTE[i % PALETTE.length],
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              maxWidth: 70,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {String(v)}
                          </span>
                        </div>
                      ))}
                      {uniqVals.length > 12 && (
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                          +{uniqVals.length - 12}개
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

            {geocoding && (
              <div
                style={{
                  marginTop: 8,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--text2)',
                    marginBottom: 6,
                  }}
                >
                  <span>주소 → 좌표 변환 중</span>
                  <span>
                    {geocodeProgress.done} / {geocodeProgress.total}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: 'var(--bg)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background: 'var(--accent)',
                      borderRadius: 2,
                      width: `${Math.round((geocodeProgress.done / geocodeProgress.total) * 100)}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Viz + AI key panel */}
      {hasData && (
        <div style={s.panel}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={s.panelTitle}>시각화</div>
            <button
              onClick={() => setShowKeyInput((v) => !v)}
              title="Gemini API Key 설정"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                opacity: geminiKey ? 1 : 0.4,
              }}
            >
              {geminiKey ? '🔑' : '🔓'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
            {[
              ['marker', '📍', '마커'],
              ['cluster', '🔵', '클러스터'],
              ['heatmap', '🌡️', '히트맵'],
            ].map(([t, icon, label]) => (
              <div
                key={t}
                onClick={() => onVizChange(t)}
                style={{
                  background: vizType === t ? 'rgba(79,124,255,0.13)' : 'var(--bg3)',
                  border: `1px solid ${vizType === t ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 7,
                  padding: '9px 5px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{label}</div>
              </div>
            ))}
          </div>

          {showKeyInput && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>
                Gemini API Key —{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  무료 발급 →
                </a>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  type="password"
                  defaultValue={geminiKey}
                  placeholder="AIza..."
                  onKeyDown={(e) => e.key === 'Enter' && saveKey(e.target.value)}
                  id="gemini-key-input"
                  style={{
                    flex: 1,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => saveKey(document.getElementById('gemini-key-input').value)}
                  style={s.btn(true, true)}
                >
                  저장
                </button>
              </div>
              {geminiKey && (
                <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>
                  ✓ Gemini AI 연결됨
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Insights */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {!hasData && (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
            <p style={{ fontSize: 12, lineHeight: 1.7 }}>
              CSV · Excel · JSON · GeoJSON을
              <br />
              올리면 공간 패턴을 분석합니다
            </p>
          </div>
        )}

        {hasData && !insights && !analyzing && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.7 }}>
              {geminiKey ? '🤖 Gemini AI로 분석합니다' : '📊 규칙 기반으로 분석합니다'}
              {!geminiKey && (
                <span
                  style={{ display: 'block', fontSize: 10, color: 'var(--text3)', marginTop: 3 }}
                >
                  🔓 키 설정 시 AI 분석 가능
                </span>
              )}
            </div>
            <button onClick={runAnalysis} style={s.btn(true)}>
              ✦ 인사이트 분석
            </button>
          </div>
        )}

        {analyzing && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text2)',
              padding: '10px 0',
            }}
          >
            <div
              style={{
                width: 13,
                height: 13,
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }}
            />
            {geminiKey ? 'Gemini AI 분석 중...' : '공간 패턴 분석 중...'}
          </div>
        )}

        {aiError && (
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 7,
              fontSize: 11,
              color: 'var(--danger)',
              marginBottom: 10,
            }}
          >
            ⚠ AI 오류: {aiError}
            <br />
            <span style={{ color: 'var(--text2)' }}>규칙 기반으로 대체 분석됩니다</span>
          </div>
        )}

        {insights && (
          <>
            <div
              style={{
                padding: '9px 12px',
                background: 'rgba(79,124,255,0.07)',
                border: '1px solid rgba(79,124,255,0.2)',
                borderRadius: 7,
                fontSize: 11,
                color: 'var(--accent)',
                marginBottom: 10,
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <span>{insights.source === 'gemini' ? '🤖' : '📊'}</span>
              <span>{insights.summary}</span>
            </div>
            {(insights.insights || []).map((ins, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '12px 14px',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ fontSize: 15 }}>{ins.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{ins.title}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.65 }}>
                  {ins.body}
                </div>
              </div>
            ))}
            <button
              onClick={runAnalysis}
              style={{ ...s.btn(false, true), width: '100%', marginTop: 4, fontSize: 11 }}
            >
              ↺ 다시 분석
            </button>
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: '11px 18px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg2)',
          display: 'flex',
          gap: 7,
          alignItems: 'center',
        }}
      >
        {shareId ? (
          <>
            <div
              style={{
                flex: 1,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--text2)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              geostory-psi.vercel.app/view/{shareId}
            </div>
            <button
              onClick={copyLink}
              style={{ ...s.btn(true), fontSize: 11, padding: '6px 11px' }}
            >
              {copied ? '✓' : '복사'}
            </button>
            <button
              onClick={handleReset}
              style={{ ...s.btn(false), fontSize: 11, padding: '6px 11px' }}
            >
              초기화
            </button>
          </>
        ) : hasData ? (
          <button onClick={handleReset} style={{ ...s.btn(false), fontSize: 12, width: '100%' }}>
            초기화
          </button>
        ) : null}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Local fallback analysis ──────────────────────────────
function analyzeLocally(rows, cols) {
  const fields = Object.keys(rows[0] || {}).filter((k) => !k.startsWith('_'));
  const catCol = fields.find((f) => /category|type|분류|카테고리|업종|구분|brand/i.test(f));
  const numCol = fields.find(
    (f) =>
      f !== cols.lat &&
      f !== cols.lng &&
      rows.slice(0, 10).filter((r) => !isNaN(parseFloat(r[f]))).length > 5,
  );
  const nameCol = fields.find((f) => /name|명칭|이름|지점|시설명|상호|title/i.test(f)) || fields[0];
  const insights = [];

  if (catCol) {
    const dist = {};
    rows.forEach((r) => {
      const v = r[catCol];
      if (v) dist[v] = (dist[v] || 0) + 1;
    });
    const top = Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    insights.push({
      icon: '📊',
      title: '카테고리 분포',
      body: `${Object.keys(dist).length}개 카테고리 중 "${top[0]?.[0]}"이 ${top[0]?.[1]}개(${Math.round(((top[0]?.[1] || 0) / rows.length) * 100)}%)로 최다. 상위 3개: ${top.map(([k, v]) => `${k}(${v})`).join(', ')}.`,
    });
  }

  if (numCol) {
    const vals = rows.map((r) => parseFloat(r[numCol])).filter((v) => !isNaN(v));
    const max = Math.max(...vals),
      min = Math.min(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const maxRow = rows.find((r) => parseFloat(r[numCol]) === max);
    insights.push({
      icon: '📈',
      title: `${numCol} 통계`,
      body: `평균 ${avg.toLocaleString()}, 최대 ${max.toLocaleString()}(${maxRow?.[nameCol] || ''}), 최소 ${min.toLocaleString()}. 최대치가 평균의 ${Math.round(max / avg)}배로 특정 지점에 집중.`,
    });
  }

  const lats = rows.map((r) => parseFloat(r[cols.lat])).filter((v) => !isNaN(v));
  const lngs = rows.map((r) => parseFloat(r[cols.lng])).filter((v) => !isNaN(v));
  if (lats.length) {
    const latSpan = (Math.max(...lats) - Math.min(...lats)).toFixed(2);
    const lngSpan = (Math.max(...lngs) - Math.min(...lngs)).toFixed(2);
    insights.push({
      icon: '🗺️',
      title: '공간 범위',
      body: `위도 ${latSpan}°, 경도 ${lngSpan}° 범위에 ${lats.length}개 포인트 분포. ${parseFloat(latSpan) > 2 ? '전국 광역 분포 — 지역별 비교 분석 유효.' : '특정 지역 집중 — 로컬 밀집도 분석에 적합.'}`,
    });
  }

  insights.push({
    icon: '💡',
    title: '활용 제안',
    body: `${numCol ? `${numCol} 수치 기준으로 버블 크기를 조정하면 시각적 임팩트가 높아집니다. ` : ''}고객에게 이 링크 하나로 지도 시각화를 바로 공유할 수 있습니다.`,
  });

  return { summary: `${rows.length}개 포인트 · ${fields.length}개 속성 분석 완료`, insights };
}
