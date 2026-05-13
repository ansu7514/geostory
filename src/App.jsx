import { useState, useRef, useEffect } from 'react';
import MapView from './MapView';
import Sidebar from './Sidebar';
import { useGeoData } from './useGeoData';

const BASE_URL = 'https://geostory-sph.vercel.app';

export default function App() {
  const [vizType, setVizType] = useState('marker');
  const [layerType, setLayerType] = useState('dark');
  const [resetTrigger, setResetTrigger] = useState(0);
  const [colorCol, setColorCol] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [shareError, setShareError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);
  const imageHandlerRef = useRef(null);
  const loadDirectRef = useRef(null);

  const {
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
  } = useGeoData();

  // loadDirect를 ref로 최신 유지
  useEffect(() => {
    loadDirectRef.current = loadDirect;
  }, [loadDirect]);

  // 페이지 로드 시 URL에서 share id 복원
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('s');
    if (!shareId) return;

    setLoadingShare(true);
    fetch(`/api/share?id=${shareId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const {
          rows: sharedRows,
          cols: sharedCols,
          fileName: sharedName,
          vizType: sharedViz,
          colorCol: sharedColor,
        } = data;
        if (sharedRows?.length) {
          loadDirectRef.current?.(sharedRows, sharedName || 'shared.csv', sharedCols || {});
          if (sharedViz) setVizType(sharedViz);
          if (sharedColor) setColorCol(sharedColor);
        }
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch((e) => setShareError('공유 데이터 로드 실패: ' + e.message))
      .finally(() => setLoadingShare(false));
  }, []);

  const handleFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'].includes(ext)) {
      imageHandlerRef.current?.(file);
    } else {
      processFile(file);
    }
  };

  // 공유 URL 생성 — Vercel Blob에 저장
  const generateShareUrl = async () => {
    setSharing(true);
    setShareError(null);
    setShareUrl(null);
    try {
      const payload = { rows, cols, fileName, vizType, colorCol };
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const url = `${BASE_URL}/?s=${data.id}`;
      setShareUrl(url);
      navigator.clipboard.writeText(url).catch(() => {});
    } catch (e) {
      setShareError('공유 링크 생성 실패: ' + e.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {loadingShare && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,17,23,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #2e3350',
              borderTopColor: '#4f7cff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#8892b0', fontSize: 13 }}>공유 데이터 불러오는 중...</div>
          <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      <header
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg2)',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.5px',
          }}
        >
          Geo<span style={{ color: 'var(--accent)' }}>Story</span>
          <small
            style={{
              fontSize: 11,
              color: 'var(--text2)',
              fontWeight: 400,
              marginLeft: 8,
              letterSpacing: 0,
            }}
          >
            by SPH
          </small>
        </div>
        {rows.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {mappedCount.toLocaleString()}개 포인트 표시 중
          </span>
        )}
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          rows={rows}
          cols={cols}
          fileName={fileName}
          mappedCount={mappedCount}
          geocoding={geocoding}
          geocodeProgress={geocodeProgress}
          fileType={fileType}
          error={error}
          vizType={vizType}
          onVizChange={setVizType}
          onLoadDirect={loadDirect}
          onReset={() => {
            reset();
            setResetTrigger((t) => t + 1);
            setColorCol(null);
            setShareUrl(null);
            setShareError(null);
          }}
          onProcessFile={handleFile}
          colorCol={colorCol}
          onColorColChange={setColorCol}
          shareUrl={shareUrl}
          shareError={shareError}
          sharing={sharing}
          onShare={generateShareUrl}
        />
        <MapView
          rows={rows}
          cols={cols}
          vizType={vizType}
          layerType={layerType}
          onLayerChange={setLayerType}
          resetTrigger={resetTrigger}
          colorCol={colorCol}
          imageHandlerRef={imageHandlerRef}
        />
      </div>
    </div>
  );
}
