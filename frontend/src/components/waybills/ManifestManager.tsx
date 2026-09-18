import React, { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  selectedIds: number[];
  companyId: number;
  onSuccess: () => void;
}

export const ManifestManager: React.FC<Props> = ({ selectedIds, companyId, onSuccess }) => {
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!destination) return alert("Please enter a destination (e.g., Durban Branch)");
    if (selectedIds.length === 0) return alert("Please select at least one parcel first.");

    setLoading(true);
    try {
      await api.post<any, any>('/manifests/create', {
        waybillIds: selectedIds,
        destination,
        companyId
      });
      alert(`✅ Manifest created for ${selectedIds.length} parcels!`);
      setDestination('');
      onSuccess(); // This clears checkboxes and refreshes the list
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to create manifest.";
      alert(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '15px', 
      background: '#f4f4f4', 
      borderRadius: '8px', 
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      border: '1px solid #ddd'
    }}>
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12px' }}>DESTINATION BRANCH</label>
        <input 
          type="text" 
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Enter manual area/branch name..."
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      
      <button 
        onClick={handleCreate}
        disabled={loading || selectedIds.length === 0}
        style={{
          padding: '10px 20px',
          backgroundColor: selectedIds.length > 0 ? '#007bff' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginTop: '15px'
        }}
      >
        {loading ? 'Generating...' : `📦 Create Manifest (${selectedIds.length})`}
      </button>
    </div>
  );
};
