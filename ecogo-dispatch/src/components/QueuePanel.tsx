import { AnimatePresence, motion } from 'framer-motion';
import { QueueItem } from '../api/types';
import { fmtWait, slaClass, waitSeconds } from './time';
import { SkeletonRows } from './Skeleton';

function Row({
  q,
  selectedId,
  onSelect,
  onRelease,
}: {
  q: QueueItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRelease?: (id: string) => void;
}) {
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
        <span>
          {q.passenger_name ?? 'Khách'} · {q.seats} ghế
        </span>
        <span className={slaClass(w)}>chờ {fmtWait(w)}</span>
      </div>
      {q.status === 'no_match' && (
        <div className="meta">
          <span className="badge-warn">Chưa ghép được — cần điều phối</span>
        </div>
      )}
      {q.status === 'processing' && (
        <div className="claimed">
          <span className="blink" />
          {q.claimed_by_name ? `${q.claimed_by_name} đang xử lý` : 'đang xử lý'}
          {onRelease && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRelease(q.id);
              }}
            >
              Trả lại
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function QueuePanel({
  queue,
  selectedId,
  loading,
  error,
  onSelect,
  onRetry,
  onRelease,
}: {
  queue: QueueItem[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onRelease?: (id: string) => void;
}) {
  // Two lanes: what has come in, and what a dispatcher is actively working.
  const received = queue.filter((q) => q.status !== 'processing');
  const processing = queue.filter((q) => q.status === 'processing');

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
            <div>
              <button className="btn btn-ghost btn-block" onClick={onRetry}>
                Thử lại
              </button>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="empty">
            <span className="empty-emoji">✓</span>Không có yêu cầu chờ xử lý.
          </div>
        ) : (
          <>
            <div className="lane-head">
              Đã nhận <span className="count">{received.length}</span>
            </div>
            {received.length === 0 ? (
              <div className="lane-empty">Không có yêu cầu mới.</div>
            ) : (
              <AnimatePresence initial={false}>
                {received.map((q) => (
                  <Row key={q.id} q={q} selectedId={selectedId} onSelect={onSelect} />
                ))}
              </AnimatePresence>
            )}

            <div className="lane-head">
              Đang xử lý <span className="count">{processing.length}</span>
            </div>
            {processing.length === 0 ? (
              <div className="lane-empty">Chưa có yêu cầu nào đang xử lý.</div>
            ) : (
              <AnimatePresence initial={false}>
                {processing.map((q) => (
                  <Row
                    key={q.id}
                    q={q}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRelease={onRelease}
                  />
                ))}
              </AnimatePresence>
            )}
          </>
        )}
      </div>
    </div>
  );
}
