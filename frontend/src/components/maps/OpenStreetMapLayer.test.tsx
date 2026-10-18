import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-leaflet", () => ({
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
}));

import OpenStreetMapLayer from "./OpenStreetMapLayer";

afterEach(cleanup);

describe("OpenStreetMapLayer", () => {
  it("uses the OSM tile source with matching, visible contributor attribution", () => {
    render(<OpenStreetMapLayer />);
    const layer = screen.getByTestId("tile-layer");
    expect(layer.getAttribute("data-url")).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(layer.getAttribute("data-attribution")).toContain("openstreetmap.org/copyright");
    expect(layer.getAttribute("data-attribution")).toContain("OpenStreetMap contributors");
    expect(layer.getAttribute("data-attribution")).not.toContain("CartoDB");
  });
});
