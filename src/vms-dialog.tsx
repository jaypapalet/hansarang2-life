import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { seoulTime, useLiveData } from './live-data';

const topisMap = 'https://topis.seoul.go.kr/map/openVmsMap.do';
const landscapeSigns = [
  { id: 'yangcheon', vmsId: 'VMO9000060', name: '양천로', detail: '등촌동 633-3', frames: 4 },
  { id: 'gonghang', vmsId: 'VMA9000180', name: '공항로', detail: '현대정유 앞', frames: 5 },
] as const;
type LandscapeSign = (typeof landscapeSigns)[number];
type PortraitData = { capturedAt: string; image: string; texts: string[]; width: number; height: number; textTop: number };
type Received = { src: string; frame: number; at: number };

function LandscapeBoard({ sign, frame, bucket }: { sign: LandscapeSign; frame: number; bucket: number }) {
  const frameNumber = frame % sign.frames + 1;
  const proxy = `/api/boards/${sign.id}/${frameNumber}?t=${bucket}`;
  const official = `https://smartway.seoul.go.kr/cctv/VmsImage.do?vmsId=${sign.vmsId}&msgDispSeq=${frameNumber}&_=${bucket}`;
  const [received, setReceived] = useState<Received | null>(null);
  const [failed, setFailed] = useState('');
  const receipts = useRef<{ bucket: number; times: Map<number, number> }>({ bucket, times: new Map() });

  useEffect(() => {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (receipts.current.bucket !== bucket) receipts.current = { bucket, times: new Map() };
      const time = receipts.current.times.get(frameNumber) ?? Date.now();
      receipts.current.times.set(frameNumber, time);
      setReceived({ src: image.src, frame: frameNumber, at: time });
      setFailed('');
    };
    image.onerror = () => {
      image.onerror = () => setFailed(proxy);
      image.src = proxy;
    };
    image.src = official;
    return () => { image.onload = null; image.onerror = null; };
  }, [bucket, frameNumber, official, proxy]);

  const unavailable = failed === proxy;
  return (
    <figure className="vms-card">
      <figcaption><strong>{sign.name}</strong><span>{sign.detail}</span></figcaption>
      <div className="vms-screen vms-landscape">
        {received ? <img src={received.src} referrerPolicy="no-referrer" alt={`${sign.name} 전광판 ${received.frame}번 화면`} />
          : <span>{unavailable ? '전광판 수신 지연' : '전광판 불러오는 중'}</span>}
      </div>
      <p className="vms-caption">
        {received ? <><time dateTime={new Date(received.at).toISOString()}>{seoulTime.format(received.at)}</time>
          {unavailable ? ' 이전 화면 · 수신 지연' : ' 수신'}<span>{received.frame} / {sign.frames}</span></>
          : unavailable ? 'TOPIS 응답 없음' : 'TOPIS 연결 중'}
      </p>
    </figure>
  );
}

function PortraitBoard({ frame }: { frame: number }) {
  const { data, failed } = useLiveData<PortraitData>('/api/boards/deungchon', 60_000);
  const frameIndex = frame % 3;
  const [tileFailed, setTileFailed] = useState('');
  const tileKey = data ? `${data.capturedAt}-${frameIndex}` : '';
  const broken = Boolean(tileKey && tileFailed === tileKey);
  const bmp = (value: string) => 'data:image/bmp;base64,' + value;

  return (
    <figure className="vms-card vms-portrait-card">
      <figcaption><strong>등촌역 앞</strong><span>세로형</span></figcaption>
      <div className="vms-screen vms-portrait">
        {data && !broken ? (
          <div className="vms-portrait-frame" style={{ width: data.width, aspectRatio: `${data.width} / ${data.height}` }}>
            <img src={bmp(data.image)} alt="등촌역 앞 도로 소통 전광판" onError={() => setTileFailed(tileKey)} />
            <img src={bmp(data.texts[frameIndex])} alt={`등촌역 앞 전광판 ${frameIndex + 1}번 안내 문구`}
              style={{ top: `${100 * data.textTop / data.height}%` }} onError={() => setTileFailed(tileKey)} />
          </div>
        ) : <span>{failed || broken ? '전광판 수신 지연' : '전광판 불러오는 중'}</span>}
      </div>
      <p className="vms-caption">
        {data && !broken ? <><time dateTime={data.capturedAt}>{seoulTime.format(new Date(data.capturedAt))}</time>
          {failed ? ' 이전 화면 · 수신 지연' : ' TOPIS 갱신'}<span>{frameIndex + 1} / 3</span></>
          : failed || broken ? 'TOPIS 응답 없음' : 'TOPIS 연결 중'}
      </p>
    </figure>
  );
}

export function VmsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [frame, setFrame] = useState(0);
  const minute = () => Math.floor(Date.now() / 60_000);
  const [bucket, setBucket] = useState(minute);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const refresh = () => { if (!document.hidden) setBucket(minute()); };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => { if (!document.hidden) setFrame(value => value + 1); }, 5500);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <dialog className="vms-dialog" ref={dialog} aria-labelledby={title} onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="vms-panel">
        <header className="vms-header">
          <h2 id={title}>실제 도로 전광판</h2>
          <div className="vms-actions">
            <button type="button" aria-label={paused ? '전광판 화면 순환 재생' : '전광판 화면 순환 일시정지'}
              onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
            <button type="button" autoFocus aria-label="전광판 닫기" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button>
          </div>
        </header>
        <div className="vms-grid">
          <div className="vms-landscape-list">
            {landscapeSigns.map(sign => <LandscapeBoard key={sign.id} sign={sign} frame={frame} bucket={bucket} />)}
          </div>
          <PortraitBoard frame={frame} />
        </div>
        <p className="source-note vms-source"><a href={topisMap} target="_blank" rel="noopener noreferrer">서울시 TOPIS 전광판 지도</a></p>
      </div>
    </dialog>
  );
}
