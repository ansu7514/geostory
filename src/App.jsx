import { useState, useRef } from 'react';
import MapView from './MapView';
import Sidebar from './Sidebar';
import { useGeoData } from './useGeoData';

export default function App() {
  const [vizType, setVizType] = useState('marker');
  const [layerType, setLayerType] = useState('dark');
  const [resetTrigger, setResetTrigger] = useState(0);
  const [colorCol, setColorCol] = useState(null);
  const imageHandlerRef = useRef(null); // MapView가 등록하는 이미지 처리 함수

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

  const handleFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'].includes(ext)) {
      // 이미지/GeoTIFF → MapView의 오버레이 패널로 전달
      imageHandlerRef.current?.(file);
    } else {
      // 데이터 파일 → 기존 처리
      processFile(file);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
            by suhyun
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
          }}
          onProcessFile={handleFile}
          colorCol={colorCol}
          onColorColChange={setColorCol}
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
