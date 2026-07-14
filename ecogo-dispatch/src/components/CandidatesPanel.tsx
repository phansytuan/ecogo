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
                    className={'cand' + (i === 0 && c.eligible ? ' top' : '')}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    style={c.eligible ? undefined : { opacity: 0.75 }}
                  >
                    <div className="nm">
                      <span>{c.driverName ?? 'Tài xế'} <span className="star">★ {c.driverRating.toFixed(1)}</span></span>
                      {i === 0 && c.eligible && <span className="badge-top">TỐT NHẤT</span>}
                      {!c.eligible && (
                        <span className="badge-top" style={{ background: '#B3261E' }}>
                          VƯỢT GIỚI HẠN
                        </span>
                      )}
                    </div>
                    <div className="kv"><span>ETA đón</span><b>{time(c.etaPickup)}</b></div>
                    {c.detour ? (
                      <>
                        <div className="kv">
                          <span>Đường vòng tài xế</span>
                          <b>
                            +{(c.detour.detourM / 1000).toFixed(1)} km ({(c.detour.detourPct * 100).toFixed(1)}%)
                          </b>
                        </div>
                        <div className="kv">
                          <span>Tuyến gốc → ghép</span>
                          <b>
                            {(c.detour.originalRemainingM / 1000).toFixed(0)} → {(c.detour.matchedRouteM / 1000).toFixed(0)} km
                          </b>
                        </div>
                      </>
                    ) : (
                      <div className="kv"><span>Lệch tuyến</span><b>{c.pickupOffsetM + c.dropoffOffsetM} m</b></div>
                    )}
                    {c.fareQuote && (
                      <div className="kv">
                        <span>Khách đi · giá</span>
                        <b>
                          {(c.fareQuote.routeDistanceM / 1000).toFixed(0)} km · {money(c.fareQuote.totalFare)}
                        </b>
                      </div>
                    )}
                    <div className="kv"><span>Ghế · giá niêm yết</span><b>{c.availableSeats} · {money(c.pricePerSeat)}</b></div>
                    {(c.rankingReason ?? c.exclusionReason) && (
                      <div style={{ fontSize: 11, opacity: 0.7, margin: '4px 0 6px' }}>
                        {c.rankingReason ?? c.exclusionReason}
                      </div>
                    )}
                    <button className="btn btn-primary assign" onClick={() => onAssign(selected.id, c.rideId)} disabled={busy}>
                      {busy ? <span className="spinner" /> : c.eligible ? 'Gán tài xế' : 'Gán (vượt giới hạn)'}
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
