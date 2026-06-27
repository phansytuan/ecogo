import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { DriverLocation, QueueItem } from '../api/types';

function Recenter({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], 9);
  }, [lat, lng, map]);
  return null;
}

export function MapPanel({
  selected,
  drivers,
}: {
  selected: QueueItem | null;
  drivers: DriverLocation[];
}) {
  const center: [number, number] = selected ? [selected.p_lat, selected.p_lng] : [20.0, 105.8];
  return (
    <div className="map">
      <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={selected?.p_lat} lng={selected?.p_lng} />
        {selected && (
          <>
            <CircleMarker
              center={[selected.p_lat, selected.p_lng]}
              radius={9}
              pathOptions={{ color: '#639922', fillColor: '#639922', fillOpacity: 0.9 }}
            >
              <Tooltip>Đón</Tooltip>
            </CircleMarker>
            <CircleMarker
              center={[selected.d_lat, selected.d_lng]}
              radius={9}
              pathOptions={{ color: '#D85A30', fillColor: '#D85A30', fillOpacity: 0.9 }}
            >
              <Tooltip>Trả</Tooltip>
            </CircleMarker>
          </>
        )}
        {drivers.map((dv) => (
          <CircleMarker
            key={dv.driverId}
            center={[dv.lat, dv.lng]}
            radius={7}
            pathOptions={{ color: '#378ADD', fillColor: '#378ADD', fillOpacity: 0.9 }}
          >
            <Tooltip>Tài xế</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
