import { Candidate, QueueItem } from '../api/types';

const money = (n: number | null) => (n == null ? '—' : n.toLocaleString('vi-VN') + 'đ');
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function CandidatesPanel({
  selected,
  candidates,
  onClaim,
  onAssign,
}: {
  selected: QueueItem | null;
  candidates: Candidate[];
  onClaim: (id: string) => void;
  onAssign: (id: string, rideId: string) => void;
}) {
  if (!selected) {
    return (
      <div className="panel">
        <h3>Ứng viên</h3>
        <div className="empty">Chọn một yêu cầu để xem tài xế phù hợp.</div>
      </div>
    );
  }
  return (
    <div className="panel">
      <h3>Ứng viên</h3>
      <div className="selhead">
        <div className="selroute">
          {selected.pickup_label ?? '—'} → {selected.dropoff_label ?? '—'}
        </div>
        <button className="claim" onClick={() => onClaim(selected.id)} disabled={!!selected.claimed_by}>
          {selected.claimed_by ? 'Đã nhận' : 'Nhận xử lý'}
        </button>
      </div>
      <div className="cands">
        {candidates.map((c, i) => (
          <div className={'cand' + (i === 0 ? ' top' : '')} key={c.rideId}>
            <div className="nm">
              {c.driverName ?? 'Tài xế'} <span className="star">★ {c.driverRating.toFixed(1)}</span>
            </div>
            <div className="kv">
              <span>ETA đón</span>
              <b>{time(c.etaPickup)}</b>
            </div>
            <div className="kv">
              <span>Lệch tuyến</span>
              <b>{c.pickupOffsetM + c.dropoffOffsetM} m</b>
            </div>
            <div className="kv">
              <span>Ghế · giá</span>
              <b>
                {c.availableSeats} · {money(c.pricePerSeat)}
              </b>
            </div>
            <button className="assign" onClick={() => onAssign(selected.id, c.rideId)}>
              Gán tài xế
            </button>
          </div>
        ))}
        {candidates.length === 0 && <div className="empty">Chưa tìm thấy ứng viên phù hợp.</div>}
      </div>
    </div>
  );
}
