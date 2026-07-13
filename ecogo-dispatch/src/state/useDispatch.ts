import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assignRequest,
  claimRequest,
  getCandidates,
  getQueue,
  getTrip,
  releaseRequest,
} from '../api/dispatch';
import { createSocket } from '../realtime/socket';
import { getToken } from '../auth/token';
import { useToast } from '../ui/toast';
import { Candidate, DriverLocation, QueueItem, TripInfo } from '../api/types';

export type ConnStatus = 'connecting' | 'online' | 'offline';

export function useDispatch() {
  const toast = useToast();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverLocation>>({});
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripInfo | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoadingQueue(true);
    try {
      const q = await getQueue();
      setQueue(q);
      setQueueError(null);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : 'Lỗi tải hàng đợi');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => refresh(true), 300);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // live-ticking clock so wait timers update every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 86400), 1000);
    return () => clearInterval(id);
  }, []);

  // socket: connection status + live events
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const s = createSocket(token);
    s.on('connect', () => setStatus('online'));
    s.on('disconnect', () => setStatus('offline'));
    s.on('connect_error', () => setStatus('offline'));
    s.io.on('reconnect_attempt', () => setStatus('connecting'));
    s.on('request.pending', debouncedRefresh);
    s.on('request.no_match', debouncedRefresh);
    s.on('booking.matched', debouncedRefresh);
    s.on('request.processing', debouncedRefresh);
    s.on('request.released', debouncedRefresh);
    s.on('driver:location', (loc: DriverLocation) =>
      setDrivers((d) => ({ ...d, [loc.driverId]: loc })),
    );
    return () => {
      s.disconnect();
    };
  }, [debouncedRefresh]);

  const select = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setCandidates([]);
      setLoadingCandidates(true);
      try {
        setCandidates(await getCandidates(id));
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Không tải được ứng viên');
      } finally {
        setLoadingCandidates(false);
      }
    },
    [toast],
  );

  const claim = useCallback(
    async (id: string) => {
      setBusyId(id);
      const prev = queue;
      // optimistic: mark claimed immediately
      setQueue((q) =>
        q.map((item) =>
          item.id === id ? { ...item, claimed_by: 'me', status: 'processing' as const } : item,
        ),
      );
      try {
        await claimRequest(id);
        toast('success', 'Đã nhận yêu cầu xử lý');
        refresh(true);
      } catch (e) {
        setQueue(prev); // rollback
        toast('error', e instanceof Error ? e.message : 'Nhận xử lý thất bại');
      } finally {
        setBusyId(null);
      }
    },
    [queue, refresh, toast],
  );

  /** Put a claimed request back on the board. */
  const release = useCallback(
    async (id: string) => {
      setBusyId(id);
      const prev = queue;
      setQueue((q) =>
        q.map((item) =>
          item.id === id ? { ...item, claimed_by: null, status: 'pending' as const } : item,
        ),
      );
      try {
        await releaseRequest(id);
        toast('success', 'Đã trả yêu cầu về hàng đợi');
        refresh(true);
      } catch (e) {
        setQueue(prev);
        toast('error', e instanceof Error ? e.message : 'Trả lại thất bại');
      } finally {
        setBusyId(null);
      }
    },
    [queue, refresh, toast],
  );

  const assign = useCallback(
    async (id: string, rideId: string) => {
      setBusyId(id);
      const prev = queue;
      // optimistic: remove from queue + clear selection
      setQueue((q) => q.filter((item) => item.id !== id));
      setSelectedId(null);
      setCandidates([]);
      try {
        await assignRequest(id, rideId);
        toast('success', 'Đã gán tài xế cho khách');
        // Read back the canonical trip the driver was given, so what dispatch
        // shows is the same row, not a re-derived copy.
        try {
          setTrip(await getTrip(id));
        } catch {
          setTrip(null);
        }
        refresh(true);
      } catch (e) {
        setQueue(prev); // rollback
        toast('error', e instanceof Error ? e.message : 'Gán tài xế thất bại');
      } finally {
        setBusyId(null);
      }
    },
    [queue, refresh, toast],
  );

  const selected = queue.find((q) => q.id === selectedId) ?? null;
  return {
    queue, selected, selectedId, candidates, drivers, status, trip,
    loadingQueue, loadingCandidates, queueError, busyId,
    select, claim, assign, release, refresh, clearTrip: () => setTrip(null),
  };
}
