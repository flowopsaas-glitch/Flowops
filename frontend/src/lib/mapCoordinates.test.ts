import { describe, expect, it } from "vitest";
import { getBestMapCenter, getMapCoordinates, hasMapCoordinates } from "./mapCoordinates";

describe("map coordinates", () => {
  it("returns a real coordinate pair without replacing or shifting it", () => {
    expect(getMapCoordinates(-26.2041, 28.0473)).toEqual({ lat: -26.2041, lng: 28.0473 });
  });

  it("accepts zero coordinates as valid rather than treating them as missing", () => {
    expect(getMapCoordinates(0, 0)).toEqual({ lat: 0, lng: 0 });
  });

  it.each([
    [null, 28],
    [undefined, 28],
    ["-26.2", 28],
    [Number.NaN, 28],
    [Number.POSITIVE_INFINITY, 28],
    [-91, 28],
    [28, 181],
  ])("does not create a location from invalid input %j", (lat, lng) => {
    expect(getMapCoordinates(lat, lng)).toBeNull();
  });

  it("centers tracking on the destination when the current location is unavailable", () => {
    expect(getBestMapCenter(null, { lat: -33.9249, lng: 18.4241 }, { lat: -26.2, lng: 28.04 }))
      .toEqual([-33.9249, 18.4241]);
  });

  it("skips an invalid current point and uses the valid destination", () => {
    expect(getBestMapCenter({ lat: 91, lng: 181 }, { lat: -33.9249, lng: 18.4241 }, { lat: -26.2, lng: 28.04 }))
      .toEqual([-33.9249, 18.4241]);
  });

  it("checks a map record using its original coordinates", () => {
    expect(hasMapCoordinates({ id: "located", lat: -26.2, lng: 28 })).toBe(true);
    expect(hasMapCoordinates({ id: "unlocated", lat: null, lng: null })).toBe(false);
    expect(hasMapCoordinates(null)).toBe(false);
  });
});
