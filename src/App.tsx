"use client";
import React, { useEffect, useState, useRef } from 'react';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { useMapEvents } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

const MapContainer = React.lazy(() => import('react-leaflet').then((m) => ({ default: m.MapContainer })));
const TileLayer = React.lazy(() => import('react-leaflet').then((m) => ({ default: m.TileLayer })));
const Marker = React.lazy(() => import('react-leaflet').then((m) => ({ default: m.Marker })));
const Popup = React.lazy(() => import('react-leaflet').then((m) => ({ default: m.Popup })));
const Polygon = React.lazy(() => import('react-leaflet').then((m) => ({ default: m.Polygon })));

const MapCenterLng = 130.40184617042544; // engineer cafe
const MapCenterLat = 33.593167890964104;
const MapDefaultZoom = 18;

const db = new PGlite("idb://my-pgdata", {
  extensions: {
    postgis,
  },
});

export default () => {
  const [rows, setRows] = useState<any[]>([]);
  const [coords, drawPolygon] = useState<any[]>([]);
  const isInitializing = useRef(false);

  const refreshData = async () => {
    const result = await db.query(`
      SELECT id, name, ST_AsText(location) as location, created_at
      FROM points
      ORDER BY id DESC
    `);
    setRows(result.rows);

    const circle = await db.query(`
      SELECT ST_AsGeoJson(
        ST_Transform(
          ST_MinimumBoundingCircle(
            ST_Collect(
              ST_Transform(location, 3857)
            )
          ), 4326
        )
      ) AS geojson
      FROM points
    `);
    const circleInvalid = await db.query(`
      SELECT ST_AsGeoJson(
        ST_MinimumBoundingCircle(
          ST_Collect(location)
        )
      ) AS geojson
      FROM points
    `);
    const geometry = (circle.rows[0] as any)?.geojson;
    // const geometry = circleInvalid.rows[0]?.geojson;
    console.log(circleInvalid);
    if (geometry) {
      const { type, coordinates } = JSON.parse(geometry);
      if (type === "Polygon") {
        const coords = coordinates[0].map(([lng, lat]: any[]) => [lat, lng]);
        drawPolygon(coords);
      }
    }
  };

  useEffect(() => {
    if (isInitializing.current) return;
    isInitializing.current = true;

    (async () => {
      const L = await import('leaflet');
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
    })();

    (async () => {
      await db.exec('CREATE EXTENSION IF NOT EXISTS postgis;');
      await db.exec(`
        -- DROP TABLE IF EXISTS points;
        CREATE TABLE IF NOT EXISTS points (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          location GEOMETRY(Point, 4326),
          created_at TIMESTAMP DEFAULT now()
        );
        DELETE FROM points;
      `);
      await refreshData()
    })();
  }, []);

  function MapClickHandler() {
    // @ts-ignore
    useMapEvents({
      click: async (e: any) => {
        const { lat, lng } = e.latlng;
        const pointName = `Clicked`;
        await db.query(
          `INSERT INTO points (name, location)
          VALUES ($1, ST_GeomFromText($2, 4326))`,
          [pointName, `POINT(${lng} ${lat})`]
        );
        await refreshData();
      },
    });
    return null;
  }

  const parseCoordinates = (wktString: string): [number, number] => {
    const match = wktString.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if (match) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      return [lat, lng]; // Leaflet uses [lat, lng]
    }
    return [MapCenterLat, MapCenterLng]; // fallback
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-6">
      <div className="w-full md:w-1/2 h-[450px] bg-slate-100 rounded-lg shadow overflow-hidden z-0">
        <MapContainer
          center={[MapCenterLat, MapCenterLng]}
          zoom={MapDefaultZoom}
          style={{ height: '80vh', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler />
          {rows.map((point) => {
            const position = parseCoordinates(point.location);
            return (
              <Marker key={point.id} position={position}>
                <Popup>
                  <strong>{point.name}</strong> <br />
                  ID: {point.id}
                </Popup>
              </Marker>
            );
          })}
          {coords && (
            <Polygon positions={coords} />
          )}
        </MapContainer>
      </div>
      <div>
        <TableBox rows={rows} />
      </div>
    </div>
  );
}

type RowProps = {
  rows: any[];
}

function TableBox({ rows }: RowProps) {
  const header = ["ID", "NAME", "LOCATION", "CREATED_AT"];

  return (
    <table className="w-full text-sm text-left text-gray-500">
      <thead className="bg-slate-200 border-b">
        <tr>
          {header.map((title, ix) => (
            <th key={ix} scope="col" className="px-4 py-3 font-semibold text-gray-700">
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white">
        {rows.map((row, ix) => (
          <tr key={ix} className="border-b hover:bg-slate-50">
            <td className="px-4 py-3">{row.id}</td>
            <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
            <td className="px-4 py-3 text-xs font-mono">{row.location}</td>
            <td className="px-4 py-3 text-xs text-gray-400">{String(row.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
