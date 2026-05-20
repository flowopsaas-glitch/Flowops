import axios from 'axios';
import { useState } from 'react';
import { useToast } from './ToastProvider';

export const EarlyAccessForm = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await axios.post('http://localhost:3000/api/leads/quote', { email });
      setStatus('success');
      showToast("Welcome to the future of logistics! Check your inbox.", "success");
    } catch (err) {
      console.error(err);
      showToast("Unable to submit your request. Please try again.", "error");
      console.error(err);
      setStatus('idle');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input 
        type="email" 
        placeholder="your@email.com" 
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg"
        required
      />
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Joining...' : 'Get Early Access'}
      </button>
    </form>
  );
};
