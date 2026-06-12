import React, { useState } from 'react';
import SignaturePad from '../../components/Delivery/SignaturePad';
import { useToast } from '../../components/ToastProvider';
import { api } from '../../api/client';

// 🚀 FIX: Defining the "Interface" removes the 3 red errors in your editor
interface DeliveryActionProps {
  waybillId: number;
  waybillNumber: string;
  onSuccess: () => void;
}

const DeliveryAction: React.FC<DeliveryActionProps> = ({ waybillId, waybillNumber, onSuccess }) => {
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleDelivery = async (signatureBase64: string) => {
    if (!recipient) {
      showToast("Please enter the recipient's name.", "error");
      return;
    }

    setLoading(true);
    try {
      // 📡 Using the ID from props for the API call
      await api.post<any, any>(`/waybills/${waybillId}/deliver`, {
        recipient,
        signatureBase64
      });
      
      showToast(`Success! Waybill ${waybillNumber} marked as Delivered.`, "success");
      onSuccess();
    } catch (err) {
      console.error("Delivery failed:", err);
      showToast("Error saving delivery. Check backend logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-lg space-y-4">
      {/* ... your existing JSX ... */}
      <h2 className="text-xl font-bold border-b pb-2 text-blue-900">Finalize Delivery</h2>
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
         <p className="text-xs text-blue-600 uppercase font-bold tracking-wider">Tracking Number</p>
         <p className="text-lg font-mono font-black text-blue-900">{waybillNumber}</p>
      </div>
      
      <div className="space-y-1">
        <label className="block text-sm font-bold text-gray-700">Received By</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="e.g. John Doe"
          className="block w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
        />
      </div>

      <SignaturePad onSave={handleDelivery} />
    </div>
  );
};

export default DeliveryAction;