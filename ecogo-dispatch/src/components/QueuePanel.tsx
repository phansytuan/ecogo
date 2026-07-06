import { AnimatePresence, motion } from 'framer-motion';
import { QueueItem } from '../api/types';
import { fmtWait, slaClass, waitSeconds } from './time';
import { SkeletonRows } from './Skeleton';

export function QueuePanel({
  queue, selectedId, loading, error, onSelect, onRetry,
}: {
  queue: QueueItem[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Hàng đợi</h3>
        <span className="count">{queue.length}</span>
      </div>
      <div className="scroll">
        {loading ? (
          <SkeletonRows n={5} />
        ) : error ? (
          <div className="errstate">
            {error}
            <div><button className="btn btn-ghost btn-block" onClick={onRetry}>Thử lại</button></div>
          </div>
        ) : queue.length === 0 ? (
          <div className="empty"><span className="empty-emoji">✓</span>Không có yêu cầu chờ xử lý.</div>
        ) : (
          <AnimatePresence initial={false}>
            {queue.map((q) => {
              const w = waitSeconds(q.created_at);
              return (
                <motion.div
                  key={q.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className={'row' + (q.id === selectedId ? ' sel' : '')}
                  onClick={() => onSelect(q.id)}
                >
                  <div className="route">
                    <span>{q.pickup_label ?? '—'}</span>
                    <span className="arrow">→</span>
                    <span>{q.dropoff_label ?? '—'}</span>
                  </div>
                  <div className="meta">
                    <span>{q.passenger_name ?? 'Khách'} · {q.seats} ghế</span>
                    <span className={slaClass(w)}>chờ {fmtWait(w)}</span>
                  </div>
                  {q.claimed_by && (
                    <div className="claimed"><span className="blink" />đang xử lý</div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
