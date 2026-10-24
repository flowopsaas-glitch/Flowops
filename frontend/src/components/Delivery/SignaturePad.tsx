import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useToast } from '../toast-context';

interface Props {
  onSave: (base64: string) => void;
  onClear?: () => void;
}

const SignaturePad: React.FC<Props> = ({ onSave, onClear }) => {
  const sigCanvas = useRef<SignatureCanvas>(null);

  const clear = () => {
    sigCanvas.current?.clear();
    if (onClear) onClear();
  };

  const { showToast } = useToast();

  const save = () => {
    if (sigCanvas.current?.isEmpty()) {
      showToast("Please provide a signature first!", "error");
      return;
    }

    /**
     * 🚀 VITE BUG FIX:
     * We use getCanvas() directly instead of getTrimmedCanvas() to avoid
     * the "import_trim_canvas.default is not a function" error.
     */
    const canvas = sigCanvas.current?.getCanvas();

    if (canvas) {
      const base64String = canvas.toDataURL('image/png');
      onSave(base64String);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <h3 className="text-sm font-semibold text-gray-600">Recipient Signature</h3>

      <div className="bg-white border rounded shadow-inner overflow-hidden">
        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          canvasProps={{
            width: 350,
            height: 200,
            className: 'signature-canvas'
          }}
        />
      </div>

      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={clear}
          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold shadow-md transition"
        >
          Confirm Delivery
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
