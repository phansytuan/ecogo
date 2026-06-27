import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assignRequest,
  claimRequest,
  getCandidates,
  getQueue,
} from '../api/dispatch';
import { createSocket } from '../realtime/socket';
import { getToken } from '../auth/token';
import { Candidate, DriverLocation, QueueItem } from '../api/types';

export function useDispatch() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverLocation>>({});
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setQueue(await getQueue());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: any queue-affecting event triggers a refresh; driver pings
  // accumulate into a map for the map panel.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const s = createSocket(token);
    socketRef.current = s;
    const onChange = () => refresh();
    s.on('request.pending', onChange);
    s.on('request.no_match', onChange);
    s.on('booking.matched', onChange);
    s.on('driver:location', (loc: DriverLocation) =>
      setDrivers((d) => ({ ...d, [loc.driverId]: loc })),
    );
    return () => {
      s.disconnect();
    };
  }, [refresh]);

  const select = useCallback(async (id: string) => {
    setSelectedId(id);
    setCandidates([]);
    try {
      setCandidates(await getCandidates(id));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const claim = useCallback(
    async (id: string) => {
      try {
        await claimRequest(id);
        await refresh();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [refresh],
  );

  const assign = useCallback(
    async (id: string, rideId: string) => {
      try {
        await assignRequest(id, rideId);
        setSelectedId(null);
        setCandidates([]);
        await refresh();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [refresh],
  );

  const selected = queue.find((q) => q.id === selectedId) ?? null;
  return { queue, selected, selectedId, candidates, drivers, error, select, claim, assign, refresh };
}
