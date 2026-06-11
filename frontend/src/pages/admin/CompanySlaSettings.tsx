import { useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../components/ToastProvider';

export default function CompanySlaSettings({
  companyId,
}: {
  companyId: string;
}) {
  const [warning, setWarning] = useState(15);
  const [breach, setBreach] = useState(30);
  const [escalate, setEscalate] = useState(60);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    axios.get(`/api/companies/${companyId}`).then(res => {
      setWarning(res.data.slaWarningMinutes);
      setBreach(res.data.slaBreachMinutes);
      setEscalate(res.data.slaEscalateMinutes);
    });
  }, [companyId]);

  const save = async () => {
    setSaving(true);
    await axios.patch(`/companies/${companyId}/sla`, {
      slaWarningMinutes: warning,
      slaBreachMinutes: breach,
      slaEscalateMinutes: escalate,
    });
    setSaving(false);
    showToast('SLA settings updated', 'success');
  };

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-bold mb-4">
        Company SLA Settings
      </h1>

      <label className="block mb-2">
        Warning (minutes)
        <input
          type="number"
          className="border p-2 w-full"
          value={warning}
          onChange={e => setWarning(+e.target.value)}
        />
      </label>

      <label className="block mb-2">
        Breach (minutes)
        <input
          type="number"
          className="border p-2 w-full"
          value={breach}
          onChange={e => setBreach(+e.target.value)}
        />
      </label>

      <label className="block mb-4">
        Escalation (minutes)
        <input
          type="number"
          className="border p-2 w-full"
          value={escalate}
          onChange={e => setEscalate(+e.target.value)}
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="bg-black text-white px-4 py-2"
      >
        {saving ? 'Saving…' : 'Save SLA Settings'}
      </button>
    </div>
  );
}
