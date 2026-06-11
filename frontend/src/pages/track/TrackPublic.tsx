import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { FLOWOPS_API_URL } from "@/lib/env";
import { Package, Truck, MapPin, CheckCircle, Clock, Phone, AlertCircle } from "lucide-react";

interface TrackingData {
  waybillNumber: string;
  status: string;
  estimatedDelivery: string | null;
  origin: string | null;
  destination: string | null;
  company: { name: string };
  driver?: { name: string; phone: string };
  timeline: Array<{
    status: string;
    timestamp: string;
    description: string;
    location?: string;
  }>;
  proofOfDelivery?: any;
  lastUpdated: string;
}

export default function TrackPublic() {
  const { token } = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) fetchTracking();
  }, [token]);

  const fetchTracking = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:3000/public-tracking/${token}`);
      setTracking(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load tracking information");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "CREATED": return <Package className="w-5 h-5" />;
      case "PICKED_UP":
      case "IN_TRANSIT":
      case "AT_HUB": return <Truck className="w-5 h-5" />;
      case "OUT_FOR_DELIVERY": return <MapPin className="w-5 h-5" />;
      case "DELIVERED": return <CheckCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED": return "bg-green-50 text-green-700 border-green-200";
      case "FAILED":
      case "RETURNED": return "bg-red-50 text-red-700 border-red-200";
      case "OUT_FOR_DELIVERY": return "bg-blue-50 text-blue-700 border-blue-200";
      case "IN_TRANSIT": return "bg-purple-50 text-purple-700 border-purple-200";
      default: return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-6 text-gray-600 text-lg">Loading tracking information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-red-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Tracking Not Found</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            Please check your tracking link or contact the sender for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (!tracking) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{tracking.company.name}</h1>
                <p className="text-sm text-gray-600">Shipment Tracking</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Waybill #</p>
              <p className="text-lg font-bold text-gray-900">{tracking.waybillNumber}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Current Status */}
        <div className={`rounded-2xl shadow-lg p-6 border-2 ${getStatusColor(tracking.status)}`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center">
                {getStatusIcon(tracking.status)}
              </div>
              <div>
                <h2 className="text-xl font-bold capitalize">
                  {tracking.status.replace(/_/g, " ")}
                </h2>
                {tracking.estimatedDelivery && (
                  <p className="text-sm mt-1 opacity-80">
                    Estimated delivery: {new Date(tracking.estimatedDelivery).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="sm:hidden">
              <p className="text-xs text-gray-500 uppercase">Waybill #</p>
              <p className="font-bold">{tracking.waybillNumber}</p>
            </div>
          </div>
        </div>

        {/* Route Info */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">From</p>
              <p className="font-semibold text-gray-900">{tracking.origin || "Origin location"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">To</p>
              <p className="font-semibold text-gray-900">{tracking.destination || "Destination"}</p>
            </div>
          </div>
        </div>

        {/* Driver Info */}
        {tracking.driver && tracking.status === "OUT_FOR_DELIVERY" && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Your Driver</h3>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                  <Truck className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{tracking.driver.name}</p>
                  <p className="text-sm text-gray-600">Your delivery driver</p>
                </div>
              </div>
              <a
                href={`tel:${tracking.driver.phone}`}
                className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                <Phone className="w-5 h-5" />
                <span>Call Driver</span>
              </a>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold mb-6 text-gray-900">Tracking History</h3>
          <div className="space-y-1">
            {tracking.timeline.map((event, index) => {
              const isLast = index === tracking.timeline.length - 1;
              return (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow ${
                      isLast
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {getStatusIcon(event.status)}
                    </div>
                    {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1"></div>}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{event.description}</p>
                        {event.location && (
                          <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.location}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Proof of Delivery */}
        {tracking.proofOfDelivery?.photoData && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Proof of Delivery</h3>
            <img
              src={tracking.proofOfDelivery.photoData}
              alt="Proof of delivery"
              className="w-full rounded-xl shadow-md"
            />
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-4">
          <p>Last updated: {new Date(tracking.lastUpdated).toLocaleString()}</p>
          <p className="mt-2 text-xs">Powered by FlowOps • South Africa's Leading Logistics Platform</p>
        </div>
      </div>
    </div>
  );
}
