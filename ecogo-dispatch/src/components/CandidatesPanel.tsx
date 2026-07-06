import { AnimatePresence, motion } from 'framer-motion';
import { Candidate, QueueItem } from '../api/types';
import { SkeletonRows } from './Skeleton';

const money = (n: number | null) => (n == null ? '—' : n.toLocaleString('vi-VN') + 'đ');
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function CandidatesPanel({
  selected, candidates, loading, busy, onClaim, onAssign,
}: {
  selected: QueueItem | null;
  candidates: Candidate[];
  loading: boolean;
  busy: boolean;
  onClaim: (id: string) => void;
  onAssign: (id: string, rideId: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Ứng viên phù hợp</h3>
        {selected && <span className="count">{candidates.length}</span>}
      </div>
      {!selected ? (
        <div className="empty"><span className="empty-emoji">👈</span>Chọn một yêu cầu để xem tài xế phù hợp.</div>
      ) : (
        <>
          <div className="selhead">
            <div className="selroute">{selected.pickup_label ?? '—'} → {selected.dropoff_label ?? '—'}</div>
            <button
              className="btn btn-ghost"
              onClick={() => onClaim(selected.id)}
              disabled={!!selected.claimed_by || busy}
            >
              {selected.claimed_by ? 'Đã nhận' : 'Nhận xử lý'}
            </button>
          </div>
          <div className="scroll">
            {loading ? (
              <SkeletonRows n={3} />
            ) : candidates.length === 0 ? (
              <div className="empty"><span className="empty-emoji">🔍</span>Chưa tìm thấy ứng viên phù hợp.</div>
            ) : (
              <AnimatePresence initial={false}>
                {candidates.map((c, i) => (
                  <motion.div
                    key={c.rideId}
                    className={'cand' + (i === 0 ? ' top' : '')}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                  >
                    <div className="nm">
                      <span>{c.driverName ?? 'Tài xế'} <span className="star">★ {c.driverRating.toFixed(1)}</span></span>
                      {i === 0 && <span className="badge-top">TỐT NHẤT</span>}
                    </div>
                    <div className="kv"><span>ETA đón</span><b>{time(c.etaPickup)}</b></div>
                    <div className="kv"><span>Lệch tuyến</span><b>{c.pickupOffsetM + c.dropoffOffsetM} m</b></div>
                    <div className="kv"><span>Ghế · giá</span><b>{c.availableSeats} · {money(c.pricePerSeat)}</b></div>
                    <button className="btn btn-primary assign" onClick={() => onAssign(selected.id, c.rideId)} disabled={busy}>
                      {busy ? <span className="spinner" /> : 'Gán tài xế'}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </>
      )}
    </div>
  );
}
