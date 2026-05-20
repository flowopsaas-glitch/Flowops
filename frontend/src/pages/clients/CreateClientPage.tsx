import React, { useState } from 'react';
import axios from 'axios';
import { useToast } from '../../components/ToastProvider';

const CreateClientPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subscriptionPlan: 'CONTRACT', // Mapping our types here
    address: ''
  });

  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Create the Company record
      const response = await axios.post('http://localhost:3000/api/companies', formData);
      const newCompanyId = response.data.id;

      // 2. Optional: Prompt to create an admin user for this client
      showToast(`Client ${formData.name} created! ID: ${newCompanyId}`, 'success');
    } catch (error) {
      console.error("Creation failed", error);
      showToast("Failed to create client. Please try again.", "error");
    }
  };

  return (
    <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg text-white">
      <h2 className="text-xl font-bold mb-4">Add New FlowOps Client</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <input 
          placeholder="Company Name" 
          className="bg-slate-800 p-2 rounded"
          onChange={e => setFormData({...formData, name: e.target.value})} 
        />
        <select 
          className="bg-slate-800 p-2 rounded"
          onChange={e => setFormData({...formData, subscriptionPlan: e.target.value})}
        >
          <option value="CONTRACT">Contract (Invoice)</option>
          <option value="PREPAID">Prepaid (Wallet)</option>
          <option value="COD">COD (Cash on Delivery)</option>
        </select>
        <input 
          placeholder="Contact Email" 
          className="bg-slate-800 p-2 rounded"
          onChange={e => setFormData({...formData, email: e.target.value})} 
        />
        <button type="submit" className="col-span-2 bg-blue-600 p-3 rounded font-bold">
          Register Client
        </button>
      </form>
    </div>
  );
};