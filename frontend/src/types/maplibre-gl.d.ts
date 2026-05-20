declare module 'maplibre-gl' {
  export class Map {
    constructor(options: any);
    on(event: string, callback: (...args: any[]) => void): this;
    addSource(id: string, source: any): this;
    addLayer(layer: any): this;
    remove(): void;
    getCanvas(): HTMLCanvasElement;
    resize(): this;
    flyTo(options: any): this;
    setCenter(center: [number, number]): this;
    setZoom(zoom: number): this;
    addControl(control: any, position?: string): this;
  }
  export class NavigationControl {}
  export class GeolocateControl {}
  export class ScaleControl {}
  export class Popup {
    constructor(options?: any);
    setLngLat(lnglat: [number, number] | { lng: number; lat: number }): this;
    setHTML(html: string): this;
    addTo(map: Map): this;
    remove(): this;
  }
  export class Marker {
    constructor(options?: any);
    setLngLat(lnglat: [number, number] | { lng: number; lat: number }): this;
    setPopup(popup: Popup): this;
    addTo(map: Map): this;
    remove(): this;
  }
}
