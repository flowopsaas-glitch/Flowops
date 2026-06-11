import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class MapsService {
  private readonly logger = new Logger("MapsService");
  private readonly NEUTRINO_USER = "Flowops";
  private readonly NEUTRINO_KEY = "UTUH4ROZHtJV0sLbGSPc4Thrn25q4LbkD1knFd447qNaq2j6";
  private readonly MAPTILER_KEY = "EYkg9BbstZyBtZf53AZj";

  async geocodeAddress(address: string) {
    try {
      const res = await axios.post("https://neutrinoapi.net/geocode-address", {
        address,
        apiKey: this.NEUTRINO_KEY,
        userId: this.NEUTRINO_USER,
      });
      return res.data.locations?.[0] || null;
    } catch (err) {
      this.logger.error("Geocode Failed", err);
      return null;
    }
  }

  async getRouteData(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    try {
      const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
      const url = `https://api.maptiler.com/routing/v1/directions/driving/${coords}.json?key=${this.MAPTILER_KEY}`;

      const res = await axios.get(url);
      const route = res.data.routes[0];

      return {
        distanceKm: route.distance / 1000,
        durationMin: Math.round(route.duration / 60),
        summary: route.legs[0]?.summary || "Main Road",
      };
    } catch (e) {
      this.logger.error("MapTiler Routing Failed");
      return null;
    }
  }
}
