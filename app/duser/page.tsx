"use client";

import { 
  useState, 
  useEffect, 
  useRef 
} from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";

export default function DuserPage() {
  const router = useRouter();
  // --- STATE MANAGEMENT ---
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [customers, setCustomers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [interactedCount, setInteractedCount] = useState(0);
  const [prevMsgCount, setPrevMsgCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [avgResponseTime, setAvgResponseTime] = useState("...");
  const [searchTerm, setSearchTerm] = useState(""); // Tambahkan ini

  // --- REFS ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [loggedInMarketingId, setLoggedInMarketingId] = useState<number | null>(null);
  const [marketingName, setMarketingName] = useState("");

  useEffect(() => {
    const session = Cookies.get("user_session");
    
    if (!session) {
      // Jika tidak ada session, paksa kembali ke login agar tidak bisa mengintip dashboard
      router.push("/user");
      return;
    }

    try {
      const userData = JSON.parse(session);
      setLoggedInMarketingId(userData.id);
      setMarketingName(userData.full_name);
    } catch (err) {
      router.push("/user");
    }
  }, []);

  // Fungsi untuk keluar (Hapus stempel login)
  const handleLogout = () => {
    Cookies.remove("user_session");
    router.push("/user");
  };

  // ---------------------------------------------------------
  // 1. LOGIKA EXPORT SPREADSHEET (CSV) FIXED
  // ---------------------------------------------------------
  const handleExportToSpreadsheet = async () => {
    
    try {
      alert("Memulai proses rekap data chat... Mohon tunggu sebentar.");
      const allDataPromises = customers.map(async (customer: any) => {
        const res = await fetch(`/api/chat?customerId=${customer.id}`);
        const messages = await res.json();
        
        return { 
          customer, 
          messages 
        };
      });

      const results = await Promise.all(allDataPromises);
      const separator = ";";
      
      let csvContent = [
        "Nama Pelanggan", 
        "No WhatsApp", 
        "Waktu Chat", 
        "Pengirim", 
        "Isi Pesan"
      ].join(separator) + "\n";

      results.forEach(({ customer, messages }) => {

        const sortedMsgs = [...messages].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        sortedMsgs.forEach((msg: any) => {
          
          const row = [
            `"${customer.full_name}"`,
            `"${customer.phone_number || customer.phone_num}"`,
            `"${new Date(msg.created_at).toLocaleString('id-ID')}"`,
            `"${msg.sender_type === 'marketing' ? 'Marketing' : 'Customer'}"`,
            `"${msg.message_text?.replace(/"/g, '""').replace(/\n/g, ' ') || '[Gambar]'}"` 
          ];
          
          csvContent += row.join(separator) + "\n";
        });
      });

      const BOM = "\uFEFF";
      const blob = new Blob(
        [BOM + csvContent], 
        { type: 'text/csv;charset=utf-8;' }
      );
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Rekap_Chat_${new Date().toLocaleDateString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Gagal ekspor:", err);
      alert("Gagal mengunduh spreadsheet.");   
    }
  };

  // ---------------------------------------------------------
  // 2. LOGIKA PERHITUNGAN SPEED
  // ---------------------------------------------------------
const calculateResponseRate = (messages: any) => {
  if (!Array.isArray(messages) || messages.length === 0) return "0%";

  const customerMessages = messages.filter(m => m.sender_type === 'customer');
  if (customerMessages.length === 0) return "100%"; 

  let repliedCount = 0;
  const sorted = [...messages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sender_type === 'customer') {
      const nextMsg = sorted[i + 1];
      if (nextMsg && nextMsg.sender_type === 'marketing') {
        repliedCount++;
      }
    }
  }
  const rate = Math.round((repliedCount / customerMessages.length) * 100);
  return `${rate}%`;
};
  // ---------------------------------------------------------
  // 3. DATA FETCHING
  // ---------------------------------------------------------
  const fetchMyCustomers = async () => {
    try {
      const res = await fetch('/api/customer');
      const data = await res.json();
      const myData = data.filter((c: any) => c.marketing_id === loggedInMarketingId);
      setCustomers(myData);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchPerformanceStats = async () => {
    try {
      const res = await fetch(`/api/chat/stats?marketingId=${loggedInMarketingId}`);
      const data = await res.json();
      setInteractedCount(data.totalInteracted || 0);
    } catch (err) { 
      console.error(err); 
    }
  };

 const fetchChatMessages = async (customerId: number, retryCount: number = 0) => {    
  try {
    const res = await fetch(`/api/chat?customerId=${customerId}`);
    
    // TAMBAHKAN PENGECEKAN RES.OK
    if (!res.ok) {
       console.warn("Server API sedang sibuk atau offline");
       return;
    }

    const data = await res.json();
    const validData = Array.isArray(data) ? data : (data.messages || []);
    
    if (validData.length === 0 && retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchChatMessages(customerId, retryCount + 1);
    }
    
    setChatMessages(validData);
    setAvgResponseTime(calculateResponseRate(validData));

  } catch (err) { 
    // Tangkap error fetch agar tidak memunculkan Overlay Merah di browser
    console.error("Fetch Chat Network Error (Cek SSH Tunnel):", err);
  }
};

  // ---------------------------------------------------------
  // 4. ACTIONS
  // ---------------------------------------------------------
  const handleSendMessage = async (e: React.FormEvent) => {
  if (e) e.preventDefault();
  if (!newMessage.trim() || !selectedChat) return;

  const messageText = newMessage;
  setNewMessage("");

  let rawPhone = selectedChat.phone_number || selectedChat.phone_num;

  let cleanPhone = rawPhone ? rawPhone.replace(/\D/g, "") : "";
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "62" + cleanPhone.slice(1);
  }

  console.log(`🚀 Membalas ke ID: ${selectedChat.id} | No: ${cleanPhone}`);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selectedChat.id,
        marketing_id: loggedInMarketingId,
        sender_type: 'marketing',
        content: messageText,
        sendToWhatsApp: true,
        phone: cleanPhone 
      }),
    });

    if (response.ok) {
      setTimeout(() => {
        fetchChatMessages(selectedChat.id);
        fetchPerformanceStats();
      }, 1500); 
    }
  } catch (err) { 
    console.error("Gagal kirim pesan:", err); 
  }
};

  const handleDeleteMessage = async (msgId: number, waId: string, phone: string) => {
    if (!confirm("Hapus pesan ini?")) return; 

    try {
      const response = await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          id_lokal: msgId,     
          whatsappId: waId,    
          phone: phone         
        }),
      });

      if (response.ok) {
        fetchChatMessages(selectedChat.id);  
      }
    } catch (err) {
      console.error("Delete Error:", err); 
    }
  };

  async function endCall(messageId: number) {
  await fetch('/api/call/update-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId })
  });

  fetchChatMessages(selectedChat.id);
}

  const handleSendImage = async (file: File) => {
    if (!selectedChat) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customer_id", selectedChat.id.toString());
    formData.append("marketing_id", loggedInMarketingId.toString());
    formData.append("phone", selectedChat.phone_number || selectedChat.phone_num);
    
    try {
      const response = await fetch('/api/chat/media', { 
        method: 'POST', 
        body: formData 
      });

      if (response.ok) {
        setTimeout(() => fetchChatMessages(selectedChat.id), 2500); 
      }
    } catch (err) { 
      console.error(err);       
    }
  };


  const handleSendVideo = async (file: File) => {
    if (!selectedChat) return;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customer_id", selectedChat.id.toString());
    formData.append("marketing_id", loggedInMarketingId.toString());
    formData.append("phone", selectedChat.phone_number || selectedChat.phone_num);
    formData.append("caption", ""); // Opsional: bisa tambah input caption
    
    try {
      const response = await fetch('/api/chat/media', { 
        method: 'POST', 
        body: formData 
      });

      const result = await response.json();
      
      if (result.success) {
        setTimeout(() => fetchChatMessages(selectedChat.id), 2500);
      } else {
        alert(`Gagal mengirim video: ${result.error || 'Unknown error'}`);
      }
    } catch (err) { 
      console.error('Error sending video:', err);
      alert('Gagal mengirim video');
    }
  };

  // ---------------------------------------------------------
  // 5. LOGIKA REKAM SUARA
  // ---------------------------------------------------------
const startRecording = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {    
      alert("Akses Mic diblokir. Pastikan menggunakan HTTPS atau localhost.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    // ✅ PRIORITY: OGG OPUS FIRST (paling universal)
    const formatPriority = [
      'audio/ogg; codecs=opus',       // ← PRIORITY #1 (Universal)
      'audio/ogg',                    // ← PRIORITY #2 
      'audio/webm; codecs=opus',      // ← PRIORITY #3 (fallback)
      'audio/webm',                   // ← PRIORITY #4
      'audio/mp4'                     // ← LAST (karena akan jadi Opus hybrid)
    ];
    
    let selectedFormat = null;
    let formatName = 'unknown';
    
    for (const format of formatPriority) {
      if (MediaRecorder.isTypeSupported(format)) {
        selectedFormat = format;
        
        if (format.includes('ogg')) formatName = 'OGG Opus (Universal WhatsApp)';
        else if (format.includes('webm')) formatName = 'WebM Opus (Desktop)';
        else if (format.includes('mp4')) formatName = 'M4A (iOS Only)';
        
        break;
      }
    }
    
    if (!selectedFormat) {
      alert('⚠️ Browser tidak support format audio yang compatible dengan WhatsApp.');
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    
    console.log('🎙️ Selected format:', selectedFormat);
    console.log('🎙️ Format name:', formatName);
    
    // ⚠️ WARNING jika bukan OGG
    if (!selectedFormat.includes('ogg')) {
      console.warn('⚠️ WARNING: Format bukan OGG, mungkin tidak compatible dengan semua device');
    }
    
    const mediaRecorder = new MediaRecorder(stream, { 
      mimeType: selectedFormat,
      audioBitsPerSecond: 16000
    });
    
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];
    const startTime = Date.now();
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      if (audioChunksRef.current.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const actualMimeType = mediaRecorder.mimeType;
      
      // ✅ EXTENSION MAPPING
      let extension = '.ogg';
      if (actualMimeType.includes('mp4')) extension = '.m4a';
      else if (actualMimeType.includes('webm')) extension = '.webm';
      else if (actualMimeType.includes('ogg')) extension = '.ogg';
      
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
      const fileName = `voice_${Date.now()}${extension}`;
      const audioFile = new File([audioBlob], fileName, { type: actualMimeType });
      
      console.log('📦 Audio file created:', {
        name: audioFile.name,
        type: audioFile.type,
        size: audioFile.size,
        duration,
        extension
      });
      
      if (audioFile.size > 16 * 1024 * 1024) {
        alert('⚠️ File terlalu besar (max 16MB)');
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // ⚠️ WARNING jika bukan OGG
      if (extension !== '.ogg') {
        const proceed = confirm(
          '⚠️ PERINGATAN COMPATIBILITY\n\n' +
          `Format: ${extension.toUpperCase()}\n\n` +
          'Format ini mungkin TIDAK BISA DIPUTAR di Android & Desktop WhatsApp.\n\n' +
          'Hanya iOS yang bisa play.\n\n' +
          'Tetap kirim?'
        );
        
        if (!proceed) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
      }
      
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("phone", selectedChat.phone_number || selectedChat.phone_num);
      formData.append("customer_id", selectedChat.id.toString());
      formData.append("marketing_id", loggedInMarketingId.toString());
      formData.append("duration", duration.toString());
      formData.append("is_voice", "true");
      
      try {
        const response = await fetch('/api/chat/media', { 
          method: 'POST', 
          body: formData 
        });
        
        const result = await response.json();
        
        console.log('📤 API Response:', result);
        
        if (result.success) {
          console.log('✅ Sent successfully');
          setTimeout(() => fetchChatMessages(selectedChat.id), 2500);
        } else {
          alert(`Gagal mengirim: ${result.error || 'Unknown error'}`);
        }
      } catch (err) {
        console.error("❌ Error:", err);
        alert('Error mengirim audio');
      } finally {
        stream.getTracks().forEach(track => track.stop());
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
    
  } catch (err) {
    console.error("❌ Mic error:", err);
    alert("Gagal mengakses mikrofon");
  }
};

const stopRecording = () => {
  if (mediaRecorderRef.current && isRecording) {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }
};
  // ---------------------------------------------------------
  // 6. EFFECTS
  // ---------------------------------------------------------
  useEffect(() => {
  const interval = setInterval(async () => {
    await fetch('/api/call/update-duration', { method: 'GET' });
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, []);

  
  useEffect(() => {
    // Pastikan data hanya di-fetch jika ID Marketing sudah tersedia dari Cookie
    if (loggedInMarketingId) {
      fetchMyCustomers();
      fetchPerformanceStats();
    }
  }, [loggedInMarketingId]);

  useEffect(() => {
    let interval: any;
    if (selectedChat && activeTab === "chat") {
      fetchChatMessages(selectedChat.id);
      interval = setInterval(() => fetchChatMessages(selectedChat.id), 3000);
    } 
    return () => clearInterval(interval);
    
  }, [selectedChat, activeTab]);

  useEffect(() => {
    
    if (chatMessages.length > prevMsgCount) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setPrevMsgCount(chatMessages.length); 
    }
  }, [chatMessages, prevMsgCount]);

const stats = [
  { label: "Klien", value: customers.length.toString(), color: "bg-blue-600", icon: "👥" },
  { label: "Interaksi", value: interactedCount.toString(), color: "bg-orange-500", icon: "💬" },
  { label: "Response Rate", value: avgResponseTime, color: "bg-green-500", icon: "📈" }, 
];

  // ---------------------------------------------------------
  // 7. RENDER
  // ---------------------------------------------------------
  
  const filteredCustomers = customers.filter((customer: any) => 
    customer.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone_number.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans overflow-hidden">
      {/* MOBILE OVERLAY */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden transition-opacity" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* SIDEBAR - Improved */}
      <aside className={`
        fixed lg:relative z-[70] w-72 h-full bg-white shadow-2xl flex flex-col
        transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        
        {/* Sidebar Header */}
        <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-blue-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">IBMP CRM</h2>
            <p className="text-xs text-blue-100 font-semibold mt-0.5">Marketing Dashboard</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="lg:hidden text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          <button 
            onClick={() => {setActiveTab("dashboard"); setIsSidebarOpen(false);}} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-semibold text-sm
              ${activeTab === "dashboard" 
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200" 
                : "text-gray-600 hover:bg-slate-100"
              }`}
          >
            <span className="text-lg">📊</span> 
            <span>Dashboard</span>
          </button>

          <button 
            onClick={() => {setActiveTab("chat"); setIsSidebarOpen(false);}} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-semibold text-sm
              ${activeTab === "chat" 
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200" 
                : "text-gray-600 hover:bg-slate-100"
              }`}
          >
            <span className="text-lg">💬</span> 
            <span>Messenger</span>
          </button>
        </nav>

        {/* Sidebar Footer - Dinamis & Aktif */}
        <div className="mt-auto p-4 border-t bg-slate-50 space-y-2">
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
              {/* Mengambil inisial nama marketing */}
              {marketingName ? marketingName[0].toUpperCase() : "M"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">
                {marketingName || "Loading..."}
              </p>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">
                ID Marketing: {loggedInMarketingId}
              </p>
            </div>
          </div>

          {/* TOMBOL LOGOUT */}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all active:scale-95 border border-transparent hover:border-red-100"
          >
            🚪 Keluar Aplikasi
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* MOBILE HEADER */}
        <div className={`
          p-4 bg-white border-b shadow-sm items-center justify-between lg:hidden 
          ${selectedChat && activeTab === "chat" ? "hidden" : "flex"}
        `}>
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="text-2xl text-gray-600 hover:text-blue-600 transition-colors"
          >
            ☰
          </button>
          <h2 className="font-black text-blue-600 text-base tracking-tight">IBMP CRM</h2>
          <div className="w-8"></div>
        </div>

        {activeTab === "dashboard" ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {/* Dashboard Header */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-800 mb-1">Dashboard Performa</h1>
                  <p className="text-sm text-gray-500">Monitoring aktivitas marketing realtime</p>
                </div>
                
                <button 
                  onClick={handleExportToSpreadsheet}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-2 w-fit"
                >
                  <span>📥</span> Export Spreadsheet
                </button>
              </div>
            </header>

            {/* Stats Grid - Improved */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
              {stats.map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-2xl">
                      {stat.icon}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
                  <h3 className="text-3xl font-black text-gray-800">{stat.value}</h3>
                </div>
              ))}
            </div>

            {/* Customer List - Improved */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-slate-100">
                <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wide">Daftar Klien</h3>
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {customers.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <div className="text-5xl mb-3">👥</div>
                    <p className="text-sm font-semibold">Belum ada klien terdaftar</p>
                  </div>
                ) : (
                  customers.map((c: any) => (
                    <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all group">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
                          {(c.full_name || "C")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-800 truncate">{c.full_name}</p>
                          <p className="text-xs text-gray-500">{c.phone_number || c.phone_num}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => { setActiveTab("chat"); setSelectedChat(c); }} 
                        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 shrink-0"
                      >
                        Chat
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          
          <div className="flex-1 flex overflow-hidden">
            {/* INBOX LIST - Improved */}
            <div className={`
              ${selectedChat ? 'hidden md:flex' : 'flex'} 
              w-full md:w-80 bg-white border-r flex-col shrink-0 shadow-lg
            `}>
              
              <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-slate-100 space-y-3">
                <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wide">Riwayat Pesan</h3>
                
                {/* INPUT SEARCH BARU */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                  <input 
                    type="text"
                    placeholder="Cari nama atau nomor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
              
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                {/* GANTI customers.length MENJADI filteredCustomers.length */}
                {filteredCustomers.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-xs font-semibold">
                      {searchTerm ? "Kontak tidak ditemukan" : "Belum ada percakapan"}
                    </p>
                  </div>
                ) : (
                  /* GANTI customers.map MENJADI filteredCustomers.map */
                  filteredCustomers.map((c: any) => (
                    <div 
                      key={c.id} 
                      onClick={() => setSelectedChat(c)} 
                      className={`p-4 border-b cursor-pointer flex items-center gap-3 transition-all
                        ${selectedChat?.id === c.id 
                          ? 'bg-blue-50 border-l-4 border-blue-600' 
                          : 'hover:bg-slate-50'
                        }`}
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-white font-bold shadow-md shrink-0">
                        {(c.full_name || "C")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{c.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">Klik untuk membalas</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CHAT WINDOW - Improved */}
            <div className={`
              ${!selectedChat ? 'hidden md:flex' : 'flex'} 
              flex-1 flex-col bg-[#e5ddd5] relative
            `}>
              
              {selectedChat ? (
                <>
                  {/* CHAT HEADER - Improved */}
                  <div className="p-4 bg-white border-b flex items-center gap-3 shadow-md z-10 shrink-0">
                    
                    <button 
                      onClick={() => setSelectedChat(null)} 
                      className="md:hidden p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      ←
                    </button>
                    
                    <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center font-bold shadow-md shrink-0">
                      {(selectedChat.full_name)[0].toUpperCase()}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-gray-800 truncate">{selectedChat.full_name}</h4>
                      <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                        Online
                      </p>
                    </div>
                  </div>

                  {/* CHAT MESSAGES - Improved */}
                  <div 
                    className="flex-1 p-4 md:p-6 space-y-3 overflow-y-auto custom-scrollbar"
                    style={{ 
                      backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                      backgroundBlendMode: "overlay",
                      backgroundColor: "#e5ddd5"
                    }}
                  >
                    
                    {chatMessages.map((msg: any, index: number) => {
                      const currentDate = new Date(msg.created_at).toLocaleDateString('id-ID');
                      const prevDate = index > 0 
                        ? new Date(chatMessages[index - 1].created_at).toLocaleDateString('id-ID')
                        : null;
                      const isNewDay = currentDate !== prevDate;
                      const isCallLog = msg.message_text?.includes('📞');
                      const formatDuration = (seconds: number) => {
                        if (!seconds || seconds <= 0) return "";
                        const mins = Math.floor(seconds / 60);
                        const secs = seconds % 60;
                        return ` (${mins}:${secs < 10 ? "0" : ""}${secs})`;
                      };

                      return (
                        <div key={msg.id} className="flex flex-col">
                          {isNewDay && (
                            <div className="flex justify-center my-4">
                              <span className="bg-white/90 backdrop-blur-sm text-gray-600 text-xs px-4 py-1.5 rounded-full font-semibold shadow-sm">
                                {currentDate}
                              </span>
                            </div>
                          )}

                          {isCallLog ? (
                            <div className="flex justify-center my-3">
                              <div className="bg-white/95 backdrop-blur-sm text-gray-700 text-xs px-5 py-3 rounded-2xl font-semibold shadow-md border border-gray-200 flex flex-col items-center gap-2 max-w-xs">
                                <div className="flex items-center gap-2 flex-wrap justify-center">
                                  <span>
                                    {msg.message_text.includes('Selesai') 
                                      ? msg.message_text 
                                      : `${msg.message_text} ${formatDuration(msg.call_duration)}`}
                                  </span>
                                  
                                  <span className="text-gray-400 text-[10px] border-l border-gray-300 pl-2">
                                    {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>

                                {msg.message_text.includes('Tersambung') && (
                                  <button
                                    onClick={() => endCall(msg.id)}
                                    className="mt-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-4 py-1.5 rounded-full text-[10px] font-bold shadow-md transition-all active:scale-95"
                                  >
                                    🛑 Akhiri Panggilan
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={`flex group ${msg.sender_type === 'marketing' ? 'justify-end' : 'justify-start'} mb-2`}>
                              <div className="relative group max-w-[85%] md:max-w-[70%]">
                                {msg.sender_type === 'marketing' && (
                                  <button 
                                    onClick={() => handleDeleteMessage(msg.id, msg.id_whatsapp, selectedChat.phone_number || selectedChat.phone_num)}
                                    className="absolute -left-12 top-2 p-2 bg-white border shadow-md rounded-full text-xs opacity-0 group-hover:opacity-100 transition-all hover:text-red-600 hover:bg-red-50 z-10"
                                  >
                                    🗑️
                                  </button>
                                )}

                                <div className={`p-3 px-4 rounded-2xl shadow-md text-xs relative transition-all
                                  ${msg.sender_type === 'marketing' 
                                    ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-sm' 
                                    : 'bg-white text-gray-800 rounded-tl-sm'
                                  }`}
                                >
              
                                    {msg.image_url && (
                                      <div className="mt-1 mb-2">
                                        {(() => {
                                          const fileName = msg.image_url;
                                          const secureUrl = `/api/chat/media?file=${fileName}`; 
                                          const urlLower = fileName.toLowerCase();
                                          
                                          // ✅ TAMBAH KONDISI VIDEO
                                          if (urlLower.match(/\.(mp4|mov|avi|webm|mkv)$/) || msg.message_text === "[Video]") {
                                            return (
                                              <div className="rounded-xl overflow-hidden shadow-md border border-black/10">
                                                <video controls className="max-w-full max-h-96">
                                                  <source src={secureUrl} type="video/mp4" />
                                                  Browser tidak support video.
                                                </video>
                                              </div>
                                            );
                                          }
                                          
                                          if (urlLower.match(/\.(ogg|mp3|wav|m4a)$/) || msg.message_text === "[Pesan Suara]") {
                                            return (
                                              <div className="flex items-center gap-2 bg-black/5 p-3 rounded-xl border border-black/10">
                                                <span className="text-xl">🎤</span>
                                                <audio controls className="h-8 w-48 md:w-64">
                                                  <source src={secureUrl} type="audio/ogg" />
                                                </audio>
                                              </div>
                                            );
                                          }

                                          if (urlLower.match(/\.(pdf|doc|docx|xls|xlsx|csv|txt)$/)) {
                                            return (
                                              <div 
                                                onClick={() => window.open(secureUrl, '_blank')} 
                                                className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white cursor-pointer min-w-[200px] shadow-md hover:shadow-lg transition-all"
                                              >
                                                <span className="text-2xl">📊</span>
                                                <span className="text-xs font-bold truncate">Download Dokumen</span>
                                              </div>
                                            );
                                          } 
                                          
                                          return (
                                            <img 
                                              src={secureUrl} 
                                              className="max-w-full rounded-xl shadow-md border border-black/10" 
                                              alt="media" 
                                              onError={(e) => {
                                                (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Gambar+Rusak";
                                              }}
                                            />
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {msg.message_text && 
                                      msg.message_text !== "[Gambar]" && 
                                      msg.message_text !== "[Pesan Suara]" && 
                                      msg.message_text !== "[Video]" && ( // ✅ TAMBAH INI
                                        <p className="leading-relaxed break-words pr-10 whitespace-pre-wrap">{msg.message_text}</p>
                                      )}

                                    <div className="flex items-center justify-end gap-1.5 mt-1">
                                      <p className="text-[10px] opacity-60">
                                        {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                      {msg.sender_type === 'marketing' && (
                                        <div className="flex -space-x-1">
                                          <span className="text-[#53bdeb] text-xs">✓</span>
                                          <span className="text-[#53bdeb] text-xs">✓</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>     
                            )}
                          </div>
                        );
                      })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* INPUT BAR - Improved */}
                  <div className="p-4 bg-white border-t shadow-lg shrink-0">
                    <form onSubmit={handleSendMessage} className="flex gap-2 items-center">                      
                      <div className="flex items-center gap-1">
                        <button 
                          type="button" 
                          onClick={() => fileInputRef.current?.click()} 
                          className="p-2.5 text-gray-600 hover:bg-slate-100 rounded-xl transition-all text-lg"
                          title="Kirim Gambar/Dokumen"
                        >
                          📎
                        </button>

                        {/* ✅ TAMBAH BUTTON VIDEO */}
                        <button 
                          type="button" 
                          onClick={() => videoInputRef.current?.click()} 
                          className="p-2.5 text-gray-600 hover:bg-slate-100 rounded-xl transition-all text-lg"
                          title="Kirim Video"
                        >
                          🎥
                        </button>

                        {!isRecording ? (
                          <button 
                            type="button" 
                            onClick={startRecording} 
                            className="p-2.5 text-gray-600 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-lg"
                            title="Rekam Suara"
                          >
                            🎤
                          </button>
                        ) : (
                          <button 
                            type="button" 
                            onClick={stopRecording} 
                            className="p-2.5 text-red-500 animate-pulse bg-red-100 rounded-xl text-lg shadow-md"
                            title="Stop Rekaman"
                          >
                            🛑
                          </button>
                        )}
                      </div>

                      <input 
                        ref={inputRef} 
                        type="text" 
                        value={newMessage} 
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={isRecording ? "Sedang merekam suara..." : "Ketik pesan..."} 
                        disabled={isRecording}
                        className="flex-1 px-4 py-3 bg-slate-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50" 
                      />

                      <button 
                        type="submit" 
                        disabled={!newMessage.trim() || isRecording} 
                        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl text-sm font-bold hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:cursor-not-allowed"
                      >
                        Kirim
                      </button>

                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => { 
                          if (e.target.files?.[0]) { 
                            handleSendImage(e.target.files[0]); 
                            e.target.value = ""; 
                          } 
                        }} 
                      />

                      {/* ✅ TAMBAH INPUT VIDEO */}
                      <input 
                        type="file" 
                        ref={videoInputRef} 
                        className="hidden" 
                        accept="video/*"
                        onChange={(e) => { 
                          if (e.target.files?.[0]) { 
                            handleSendVideo(e.target.files[0]); 
                            e.target.value = ""; 
                          } 
                        }} 
                      />
                    </form> 
                  </div>
                </>
              ) : (
                
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-slate-50 to-slate-100">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-5xl mb-4 shadow-lg">
                    💬
                  </div>
                  <h4 className="font-bold text-gray-700 text-base mb-2">Pilih Percakapan</h4>
                  <p className="text-sm text-gray-500 max-w-xs">Pilih customer dari daftar untuk memulai percakapan</p>
                </div>
              )}
            </div>
          </div> 
        )}
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { 
          width: 6px; 
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track { 
          background: transparent; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: #cbd5e1; 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
          background: #94a3b8; 
        }
        
        @media (max-width: 768px) {
          .custom-scrollbar::-webkit-scrollbar {
            width: 3px;
          }
        }
      `
      }</style>
    </div>
  );
}