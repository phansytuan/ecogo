import { motion } from 'framer-motion';
import { QueueItem } from '../api/types';
import { useCountUp } from '../hooks/useCountUp';
import { waitSeconds } from './time';

function Kpi({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const n = useCountUp(value);
  return (
    <motion.div
      className={'kpi' + (warn ? ' warn' : '')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="l">{label}</div>
      <div className="v">{n}</div>
    </motion.div>
  );
}

export function KpiBar({ queue }: { queue: QueueItem[] }) {
  const waiting = queue.length;
  const noMatch = queue.filter((q) => q.status === 'no_match').length;
  const breaches = queue.filter((q) => waitSeconds(q.created_at) > 900).length;
  return (
    <div className="kpis">
      <Kpi label="Đang chờ ghép" value={waiting} />
      <Kpi label="Đã escalate" value={noMatch} />
      <Kpi label="Vượt SLA 15 phút" value={breaches} warn={breaches > 0} />
    </div>
  );
}
