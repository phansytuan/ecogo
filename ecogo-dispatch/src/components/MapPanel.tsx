import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DriverLocation, QueueItem } from '../api/types';

const driverIcon = L.divIcon({
  className: '',
  html: '<span class="map-pulse"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FlyTo({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.flyTo([lat, lng], 9, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

export function MapPanel({ selected, drivers }: { selected: QueueItem | null; drivers: DriverLocation[] }) {
  const center = useMemo<[number, number]>(
    () => (selected ? [selected.p_lat, selected.p_lng] : [20.0, 105.8]),
    [selected],
  );
  return (
    <div className="map">
      <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FlyTo lat={selected?.p_lat} lng={selected?.p_lng} />
        {selected && (
          <>
            <CircleMarker center={[selected.p_lat, selected.p_lng]} radius={9}
              pathOptions={{ color: '#5ea954', fillColor: '#5ea954', fillOpacity: 0.9, weight: 2 }}>
              <Tooltip>Điểm đón</Tooltip>
            </CircleMarker>
            <CircleMarker center={[selected.d_lat, selected.d_lng]} radius={9}
              pathOptions={{ color: '#c96442', fillColor: '#c96442', fillOpacity: 0.9, weight: 2 }}>
              <Tooltip>Điểm trả</Tooltip>
            </CircleMarker>
          </>
        )}
        {drivers.map((d) => (
          <Marker key={d.driverId} position={[d.lat, d.lng]} icon={driverIcon}>
            <Tooltip>Tài xế đang chạy</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span><i style={{ background: '#5ea954' }} />Điểm đón</span>
        <span><i style={{ background: '#c96442' }} />Điểm trả</span>
        <span><i style={{ background: '#4a90d9' }} />Tài xế ({drivers.length})</span>
      </div>
    </div>
  );
}
