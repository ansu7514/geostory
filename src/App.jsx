import { useState } from 'react';
import MapView from './MapView';
import Sidebar from './Sidebar';
import { useGeoData } from './useGeoData';

export default function App() {
  const [vizType, setVizType] = useState('marker');
  const [layerType, setLayerType] = useState('dark');
  const [resetTrigger, setResetTrigger] = useState(0);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {rows.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {mappedCount.toLocaleString()}개 포인트 표시 중
            </span>
          )}
        </div>
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
          }}
          onProcessFile={processFile}
        />
        <MapView
          rows={rows}
          cols={cols}
          vizType={vizType}
          layerType={layerType}
          onLayerChange={setLayerType}
          resetTrigger={resetTrigger}
        />
      </div>
    </div>
  );
}
