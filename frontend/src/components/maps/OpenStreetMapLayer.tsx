import { TileLayer } from "react-leaflet";

export const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OPENSTREETMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

/** Shared, correctly attributed basemap layer used by FlowOps map views. */
export default function OpenStreetMapLayer() {
  return <TileLayer url={OPENSTREETMAP_TILE_URL} attribution={OPENSTREETMAP_ATTRIBUTION} />;
}
