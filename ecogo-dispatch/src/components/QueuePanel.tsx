import { QueueItem } from '../api/types';

const wait = (s: number) => `${Math.floor(s / 60)}'`;
const slaClass = (s: number) => (s > 900 ? 'sla brk' : s > 600 ? 'sla warn' : 'sla');

export function QueuePanel({
  queue,
  selectedId,
  onSelect,
}: {
  queue: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel">
      <h3>Hàng đợi ({queue.length})</h3>
      <div className="rows">
        {queue.map((q) => (
          <div
            key={q.id}
            className={'row' + (q.id === selectedId ? ' sel' : '')}
            onClick={() => onSelect(q.id)}
          >
            <div className="route">
              {q.pickup_label ?? '—'} → {q.dropoff_label ?? '—'}
            </div>
            <div className="meta">
              <span>
                {q.passenger_name ?? 'Khách'} · {q.seats} ghế
              </span>
              <span className={slaClass(q.waiting_s)}>chờ {wait(q.waiting_s)}</span>
            </div>
            {q.claimed_by && <div className="claimed">● đang xử lý</div>}
          </div>
        ))}
        {queue.length === 0 && <div className="empty">Không có yêu cầu chờ.</div>}
      </div>
    </div>
  );
}
