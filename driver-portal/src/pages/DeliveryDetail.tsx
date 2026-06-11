import { useState } from 'react';
import { ArrowLeft, MapPin, Phone, Camera, PenTool, CheckCircle, Package } from 'lucide-react';
import { driverApi } from '../services/api';
import { smartApiCall } from '../services/syncHandler';
import SignaturePad from '../components/SignaturePad';
import CameraCapture from '../components/CameraCapture';

interface DeliveryDetailProps {
  waybill: any;
  driver: any;
  onBack: () => void;
  onComplete: () => void;
}

export default function DeliveryDetail({ waybill, driver, onBack, onComplete }: DeliveryDetailProps) {
  const [showSignature, setShowSignature] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState(waybill.receiverName || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!signature && !photo) {
      alert('Please provide a signature or photo');
      return;
    }

    setSubmitting(true);
    try {
      const podData = {
        driverId: driver.driverId,
        waybillId: waybill.id,
        signatureData: signature || undefined,
        photoData: photo || undefined,
        recipientName: recipientName || undefined,
        notes: notes || undefined,
        source: 'PWA',
      };

      const result = await smartApiCall(
        () => driverApi.uploadPod(podData),
        { type: 'POD_UPLOAD', payload: podData }
      );

      if (result.queued) {
        // Show offline success message
        setSuccess(true);
        setTimeout(() => onComplete(), 2000);
      } else {
        setSuccess(true);
        setTimeout(() => onComplete(), 2000);
      }
    } catch (err: any) {
      alert('Failed to submit: ' + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-4">
        <div className="text-center">
          <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Delivery Complete!</h2>
          <p className="text-gray-600">Proof of delivery saved successfully</p>
        </div>
      </div>
    );
  }

  const isPending = waybill.status === 'PENDING';
  const actionLabel = isPending ? 'Mark as Collected' : 'Mark as Delivered';

  return (
    <div className="min-h-screen bg-gray-50 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="ml-2">
            <h1 className="font-bold text-lg">{waybill.waybillNumber}</h1>
            <p className="text-xs text-gray-500">{waybill.status}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Route Info */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3 flex items-center">
            <Package className="w-4 h-4 mr-2" /> Route Details
          </h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3"></div>
              <div>
                <div className="text-xs text-gray-500">From</div>
                <div className="font-medium">{waybill.origin || 'Not specified'}</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3"></div>
              <div>
                <div className="text-xs text-gray-500">To</div>
                <div className="font-medium">{waybill.destination || 'Not specified'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recipient Info */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3 flex items-center">
            <MapPin className="w-4 h-4 mr-2" /> Recipient
          </h3>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500">Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 mt-1"
                placeholder="Recipient name"
              />
            </div>
            {waybill.receiverPhone && (
              <a href={`tel:${waybill.receiverPhone}`} className="flex items-center text-blue-600 text-sm">
                <Phone className="w-4 h-4 mr-1" /> {waybill.receiverPhone}
              </a>
            )}
          </div>
        </div>

        {/* Signature */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3 flex items-center">
            <PenTool className="w-4 h-4 mr-2" /> Signature
          </h3>
          {signature ? (
            <div className="relative">
              <img src={signature} alt="Signature" className="w-full h-32 border rounded-lg" />
              <button
                onClick={() => setSignature(null)}
                className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignature(true)}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
            >
              Tap to capture signature
            </button>
          )}
        </div>

        {/* Photo */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3 flex items-center">
            <Camera className="w-4 h-4 mr-2" /> Photo Proof
          </h3>
          {photo ? (
            <div className="relative">
              <img src={photo} alt="POD" className="w-full rounded-lg" />
              <button
                onClick={() => setPhoto(null)}
                className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCamera(true)}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
            >
              Tap to take photo
            </button>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold mb-3">Notes (Optional)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg p-2"
            placeholder="Any delivery notes..."
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (!signature && !photo)}
          className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 shadow-lg"
        >
          {submitting ? 'Submitting...' : actionLabel}
        </button>
      </div>

      {showSignature && (
        <SignaturePad
          onSave={(data) => { setSignature(data); setShowSignature(false); }}
          onCancel={() => setShowSignature(false)}
        />
      )}

      {showCamera && (
        <CameraCapture
          onSave={(data) => { setPhoto(data); setShowCamera(false); }}
          onCancel={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
