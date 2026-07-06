import { useDispatch } from '../state/useDispatch';
import { KpiBar } from './KpiBar';
import { QueuePanel } from './QueuePanel';
import { MapPanel } from './MapPanel';
import { CandidatesPanel } from './CandidatesPanel';

const STATUS_LABEL = { online: 'Trực tuyến', connecting: 'Đang kết nối…', offline: 'Mất kết nối' };

export function Cockpit({ onLogout }: { onLogout: () => void }) {
  const d = useDispatch();
  return (
    <div className="cockpit">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">E</span>
          ECOGO <small>Bàn điều phối</small>
        </span>
        <div className="topbar-spacer" />
        <span className={'conn ' + d.status}>
          <span className="conn-dot" />
          {STATUS_LABEL[d.status]}
        </span>
        <button className="logout" onClick={onLogout}>Đăng xuất</button>
      </header>
      <KpiBar queue={d.queue} />
      <div className="grid">
        <QueuePanel
          queue={d.queue}
          selectedId={d.selectedId}
          loading={d.loadingQueue}
          error={d.queueError}
          onSelect={d.select}
          onRetry={() => d.refresh()}
        />
        <MapPanel selected={d.selected} drivers={Object.values(d.drivers)} />
        <CandidatesPanel
          selected={d.selected}
          candidates={d.candidates}
          loading={d.loadingCandidates}
          busy={d.busyId != null}
          onClaim={d.claim}
          onAssign={d.assign}
        />
      </div>
    </div>
  );
}
