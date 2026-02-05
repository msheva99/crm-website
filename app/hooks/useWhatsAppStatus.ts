// hooks/useWhatsAppStatus.ts
export const useWhatsAppStatus = () => {
  const fetchQR = async (sessionId: string) => {
    // Logika fetch ke API Next.js yang nembak Wuzapi di VPS
  };

  const checkStatus = async (sessionId: string) => {
    // Logika ngecek apakah sudah "Connected"
  };

  return { fetchQR, checkStatus };
};