import { QueueItem } from '../api/types';

export function KpiBar({ queue }: { queue: QueueItem[] }) {
  const waiting = queue.length;
  const noMatch = queue.filter((q) => q.status === 'no_match').length;
  const breaches = queue.filter((q) => q.waiting_s > 900).length;
  const items = [
    { l: 'Đang chờ ghép', v: String(waiting) },
    { l: 'Đã escalate', v: String(noMatch) },
    { l: "Vượt SLA 15'", v: String(breaches), warn: breaches > 0 },
  ];
  return (
    <div className="kpis">
      {items.map((k, i) => (
        <div className="kpi" key={i}>
          <div className="l">{k.l}</div>
          <div className={'v' + (k.warn ? ' warn' : '')}>{k.v}</div>
        </div>
      ))}
    </div>
  );
}
