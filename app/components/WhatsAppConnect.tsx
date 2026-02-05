// components/WhatsAppConnect.tsx
'use client';
import { useState } from 'react';

export default function WhatsAppConnect() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState('Disconnected');

  const handleConnect = async () => {
    setStatus('Loading QR...');
    // Nanti kita panggil fungsi dari Hooks di sini
  };

  return (
    <div className="p-6 border rounded-xl shadow-sm bg-white max-w-sm">
      <h2 className="text-xl font-bold mb-4">WhatsApp CRM</h2>
      <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg p-4 min-h-[250px]">
        {qrCode ? (
          <img src={qrCode} alt="Scan Me" className="w-48 h-48" />
        ) : (
          <p className="text-gray-500 text-sm text-center">
            {status === 'Disconnected' ? 'Klik tombol di bawah untuk memunculkan QR Code' : status}
          </p>
        )}
      </div>
      <button 
        onClick={handleConnect}
        className="w-full mt-4 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition"
      >
        {qrCode ? 'Refresh QR' : 'Hubungkan WhatsApp'}
      </button>
    </div>
  );
}