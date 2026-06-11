import { useRef, useState } from 'react';
import { Camera, X, Check } from 'lucide-react';

interface CameraCaptureProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onSave, onCancel }: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (preview) onSave(preview);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg">Take Photo</h3>
          <p className="text-sm text-gray-500">Proof of delivery/collection</p>
        </div>

        <div className="p-4">
          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-64 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:bg-gray-50"
            >
              <Camera className="w-12 h-12 text-gray-400 mb-2" />
              <span className="text-gray-600">Tap to take photo</span>
              <span className="text-xs text-gray-400 mt-1">or choose from gallery</span>
            </button>
          ) : (
            <img src={preview} alt="Preview" className="w-full rounded-lg" />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="p-4 flex space-x-2 border-t">
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <X className="w-4 h-4 mr-1" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!preview}
            className="flex-1 flex items-center justify-center py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-1" /> Use Photo
          </button>
        </div>
      </div>
    </div>
  );
}
