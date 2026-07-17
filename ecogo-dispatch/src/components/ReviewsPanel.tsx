import { ReviewRide } from '../api/types';

type ReviewOutcome = 'completed' | 'cancelled';

interface ReviewsPanelProps {
  reviews: ReviewRide[];
  busyRideId: string | null;
  onResolve: (
    rideId: string,
    outcome: ReviewOutcome,
    reason: string,
  ) => void;
}

export function ReviewsPanel({
  reviews,
  busyRideId,
  onResolve,
}: ReviewsPanelProps) {
  if (reviews.length === 0) return null;

  const askToResolve = (ride: ReviewRide, outcome: ReviewOutcome) => {
    const reason = window.prompt('Lý do (bắt buộc, ≥ 3 ký tự):');
    if (!reason || reason.trim().length < 3) return;
    onResolve(ride.id, outcome, reason.trim());
  };

  return (
    <section className="reviews-banner">
      <h2>Chuyến quá hạn cần xử lý ({reviews.length})</h2>
      <div className="reviews-list">
        {reviews.map((ride) => (
          <article className="reviews-card" key={ride.id}>
            <div className="reviews-route">
              {ride.origin_label ?? 'Điểm đi chưa rõ'}
              <span>→</span>
              {ride.dest_label ?? 'Điểm đến chưa rõ'}
            </div>
            <div className="reviews-meta">
              Khởi hành: {new Date(ride.departure_time).toLocaleString('vi-VN')}
            </div>
            <div className="reviews-meta">
              {ride.driver_name ?? 'Tài xế chưa rõ'}
              {ride.driver_phone ? ` · ${ride.driver_phone}` : ''}
            </div>
            <div className="reviews-stats">
              {ride.active_bookings} khách · {ride.total_seats} ghế ·{' '}
              {ride.total_fare.toLocaleString('vi-VN')}đ
            </div>
            <div className="reviews-actions">
              <button
                type="button"
                className="reviews-btn complete"
                disabled={busyRideId === ride.id}
                onClick={() => askToResolve(ride, 'completed')}
              >
                Xác nhận hoàn thành
              </button>
              <button
                type="button"
                className="reviews-btn cancel"
                disabled={busyRideId === ride.id}
                onClick={() => askToResolve(ride, 'cancelled')}
              >
                Huỷ chuyến
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
