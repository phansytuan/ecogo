import { useDispatch } from '../state/useDispatch';
import { KpiBar } from './KpiBar';
import { QueuePanel } from './QueuePanel';
import { MapPanel } from './MapPanel';
import { CandidatesPanel } from './CandidatesPanel';

export function Cockpit({ onLogout }: { onLogout: () => void }) {
  const d = useDispatch();
  return (
    <div className="cockpit">
      <header className="topbar">
        <span className="brand">ECOGO · Bàn điều phối</span>
        {d.error && <span className="err inline">{d.error}</span>}
        <button className="logout" onClick={onLogout}>
          Đăng xuất
        </button>
      </header>
      <KpiBar queue={d.queue} />
      <div className="grid">
        <QueuePanel queue={d.queue} selectedId={d.selectedId} onSelect={d.select} />
        <MapPanel selected={d.selected} drivers={Object.values(d.drivers)} />
        <CandidatesPanel
          selected={d.selected}
          candidates={d.candidates}
          onClaim={d.claim}
          onAssign={d.assign}
        />
      </div>
    </div>
  );
}
