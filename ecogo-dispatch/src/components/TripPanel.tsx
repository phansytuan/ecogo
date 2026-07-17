import { motion } from "framer-motion";
import { TripInfo } from "../api/types";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const money = (n: number) => n.toLocaleString("vi-VN") + "đ";

/**
 * The trip a processed request was assigned to — read back from the server so it
 * is exactly the trip the driver received, not a client-side reconstruction.
 */
export function TripPanel({
  trip,
  onClose,
}: {
  trip: TripInfo;
  onClose: () => void;
}) {
  const { segment: seg } = trip;
  return (
    <motion.div
      className="panel trip-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="panel-head">
        <h3>Chuyến đã gán</h3>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          Đóng
        </button>
      </div>
      <div className="scroll trip-body">
        <div className="trip-route">
          <strong>{trip.trip.originAddress ?? trip.trip.origin ?? "—"}</strong>
          <span className="arrow">→</span>
          <strong>
            {trip.trip.destinationAddress ?? trip.trip.dest ?? "—"}
          </strong>
        </div>

        <dl className="kv">
          <dt>Tài xế</dt>
          <dd>
            {trip.driver.name ?? "—"}
            {trip.driver.phone ? ` · ${trip.driver.phone}` : ""}
          </dd>

          <dt>Xe</dt>
          <dd>
            {trip.vehicle.plate} · {trip.vehicle.seats} ghế
          </dd>

          <dt>Khởi hành</dt>
          <dd>{time(trip.trip.departureTime)}</dd>

          <dt>Tuyến gốc</dt>
          <dd>
            {trip.trip.originalRouteDistanceMeters == null
              ? "Chưa có dữ liệu"
              : `${(trip.trip.originalRouteDistanceMeters / 1000).toFixed(1)} km · ${Math.round((trip.trip.originalRouteDurationSeconds ?? 0) / 60)} phút`}
          </dd>

          <dt>Định tuyến</dt>
          <dd>
            {trip.trip.routeValid
              ? `${trip.trip.routingProvider ?? "—"} · đã xác thực`
              : "Tuyến cũ/chưa xác thực"}
          </dd>

          {trip.trip.waypoints.map((w) => (
            <div key={w.position}>
              <dt>Điểm dừng {w.position + 1}</dt>
              <dd>{w.formattedAddress}</dd>
            </div>
          ))}

          <dt>Đón khách</dt>
          <dd>
            {seg.pickupAddress ?? seg.pickupLabel ?? "—"} ·{" "}
            {time(seg.pickupEta)}
          </dd>

          <dt>Trả khách</dt>
          <dd>
            {seg.dropoffAddress ?? seg.dropoffLabel ?? "—"} ·{" "}
            {time(seg.dropoffEta)}
          </dd>

          <dt>Số ghế</dt>
          <dd>{seg.seats}</dd>

          {seg.routeDistanceKm != null && (
            <>
              <dt>Khách đi</dt>
              <dd>{seg.routeDistanceKm.toFixed(1)} km (tính giá)</dd>
            </>
          )}

          {seg.detourKm != null && (
            <>
              <dt>Tài xế đi vòng</dt>
              <dd>
                +{seg.detourKm.toFixed(1)} km
                {seg.detourPct != null && (
                  <> ({(seg.detourPct * 100).toFixed(1)}%)</>
                )}
                {seg.extraDurationS != null && seg.extraDurationS > 0 && (
                  <> · +{Math.round(seg.extraDurationS / 60)} phút</>
                )}
              </dd>
            </>
          )}

          <dt>Giá</dt>
          <dd>{seg.fare == null ? "—" : money(seg.fare)}</dd>
        </dl>

        {seg.companions.length > 0 && (
          <>
            <div className="lane-head">
              Khách đi cùng{" "}
              <span className="count">{seg.companions.length}</span>
            </div>
            {seg.companions.map((c, i) => (
              <div className="row" key={i}>
                <div className="route">
                  <span>{c.fullName}</span>
                </div>
                <div className="meta">
                  <span>{c.phone ?? "—"}</span>
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}
