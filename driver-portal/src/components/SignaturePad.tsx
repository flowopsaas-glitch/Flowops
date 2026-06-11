import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Check } from 'lucide-react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleSave = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Sign Here</h3>
            <p className="text-sm text-gray-500">Recipient signature</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg">
            <SignatureCanvas
              ref={sigRef}
              penColor="black"
              canvasProps={{ 
                className: 'w-full h-48 rounded-lg',
                style: { width: '100%', height: '192px' }
              }}
              onBegin={() => setIsEmpty(false)}
            />
          </div>
        </div>

        <div className="p-4 flex space-x-2 border-t">
          <button
            onClick={handleClear}
            className="flex-1 flex items-center justify-center py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <X className="w-4 h-4 mr-1" /> Clear
          </button>
          <button
            onClick={handleSave}
            disabled={isEmpty}
            className="flex-1 flex items-center justify-center py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-1" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
