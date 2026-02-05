"use client";
import { useState, useEffect, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const router = useRouter();
  
  // --- TAMBAHKAN LOGIC PROTEKSI INI ---
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    // Ambil data session khusus admin
    const session = Cookies.get("admin_session");
    
    if (!session) {
      // Jika tidak ada session admin, tendang ke login admin
      router.push("/admin");
      return;
    }

    try {
      const adminData = JSON.parse(session);
      // Validasi ulang apakah role-nya benar admin
      if (adminData.role !== 'admin') {
        router.push("/admin");
        return;
      }
      setAdminName(adminData.full_name);
    } catch (err) {
      router.push("/admin");
    }
  }, []);

  const handleLogoutAdmin = () => {
    Cookies.remove("admin_session");
    router.push("/admin");
  };
  
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- DATA STATE ---
  const [teamStats, setTeamStats] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prevMsgCount, setPrevMsgCount] = useState(0);
  const [selectedMarketingId, setSelectedMarketingId] = useState("");
  const [monitoredMarketingId, setMonitoredMarketingId] = useState("");
  const [selectedClientChat, setSelectedClientChat] = useState(null);
  const [editingMarketing, setEditingMarketing] = useState(null);
  const [newMarketing, setNewMarketing] = useState({ name: "", username: "", password: "", phone: ""});
  const [waStatuses, setWaStatuses] = useState({}); // Simpan status online/offline tiap marketing
  const [qrCode, setQrCode] = useState(null);       // Simpan gambar QR
  const [isConnecting, setIsConnecting] = useState(false); // Loading saat ambil QR


  const chatEndRef = useRef(null);

  // --- FETCH FUNCTIONS ---
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      setTeamStats(data);
    } catch (err) { console.error("Gagal fetch user:", err); }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customer', { cache: 'no-store' });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) { 
      console.error("Gagal fetch customer:", err); 
      // Opsi: Berikan feedback ke UI kalau database offline
    } finally { 
      setLoading(false); 
    }
  };

  const fetchChatMessages = async (customerId) => {
    try {
      const res = await fetch(`/api/chat?customerId=${customerId}`);
      const data = await res.json();
      const validData = Array.isArray(data) ? data : (data.messages || []);
      setChatMessages(validData);
    } catch (err) { 
      console.error("Gagal fetch chat:", err); 
      setChatMessages([]); 
    }
  };

  const fetchAllWAStatus = async () => {
    const newStatuses = {};
    // Hanya cek status untuk user yang rolenya marketing
    const marketings = teamStats.filter(u => u.role === 'marketing');
    
    // Gunakan Promise.all agar fetch berjalan barengan (lebih cepat)
    await Promise.all(marketings.map(async (m) => {
      try {
        const res = await fetch(`/api/whatsapp/status?session=${m.username}`);
        const data = await res.json();
        // Simpan status true/false
        newStatuses[m.username] = data.connected ? 'Connected' : 'Disconnected';
      } catch (err) { 
        newStatuses[m.username] = 'Error'; 
      }
    }));
    
    setWaStatuses(newStatuses);
  };

  const handleGetQR = async (username) => {
    setIsConnecting(true);
    setQrCode(null);
    try {
      const res = await fetch(`/api/whatsapp/qr?session=${username}`);
      const data = await res.json();
      
      if (data.qr) {
        setQrCode(data.qr); 
        // OPSIONAL: Jalankan cek status sekali untuk memastikan
        fetchAllWAStatus();
      } else if (data.error === "Sudah Terhubung") {
        // Jika ternyata sudah konek, langsung update status
        fetchAllWAStatus();
      } else {
        alert("Gagal: " + (data.error || "QR belum siap"));
      }
    } catch (err) { 
      console.error(err);
      alert("Terjadi kesalahan koneksi ke server"); 
    } finally { 
      setIsConnecting(false); 
    }
  };

  // Initial Fetch & Polling
  useEffect(() => {
    fetchUsers();
    fetchCustomers();
    const interval = setInterval(() => {
      fetchCustomers();
      fetchAllWAStatus(); // Tambahkan ini
    }, 10000); 
    return () => clearInterval(interval);
  }, [teamStats.length]); // Re-run jika jumlah tim berubah


  useEffect(() => {
    let interval;
    if (selectedClientChat) {
      fetchChatMessages(selectedClientChat.id);
      interval = setInterval(() => fetchChatMessages(selectedClientChat.id), 3000);
    } else {
      setChatMessages([]);
      setPrevMsgCount(0);
    }
    return () => clearInterval(interval);
  }, [selectedClientChat]);

  useEffect(() => {
    if (chatMessages.length > prevMsgCount) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setPrevMsgCount(chatMessages.length);
    }
  }, [chatMessages, prevMsgCount]);

  // --- ANALYTICS HELPERS ---
  const getClientCount = (marketingId) => {
    return customers.filter(c => c.marketing_id === marketingId).length;
  };

  const getAverageResponseTime = (marketingId) => {
    if (chatMessages.length < 2) return "N/A";
    let totalDiff = 0;
    let count = 0;
    for (let i = 1; i < chatMessages.length; i++) {
      const current = chatMessages[i];
      const prev = chatMessages[i - 1];
      if (prev.sender_type === 'customer' && current.sender_type === 'marketing') {
        const diff = Math.abs(new Date(current.created_at).getTime() - new Date(prev.created_at).getTime());
        totalDiff += diff;
        count++;
      }
    }
    if (count === 0) return "N/A";
    const avgMins = Math.round((totalDiff / count) / 60000);
    return `${avgMins} mnt`;
  };

  // --- HANDLERS ---
  const handleAddMarketing = async (e) => {
    e.preventDefault();
    
    // Bersihkan nomor (hanya angka, pastikan format 62)
    let cleanPhone = newMarketing.phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.slice(1);

    const method = editingMarketing ? 'PATCH' : 'POST';
    const url = editingMarketing ? `/api/user/${editingMarketing.id}` : '/api/user';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
        username: newMarketing.username,
        password: newMarketing.password || undefined,
        full_name: newMarketing.name,
        phone_number: cleanPhone, // Ubah dari 'phone' menjadi 'phone_number'
        role: 'marketing'
      }),
      });
      
      if (response.ok) {
        setIsModalOpen(false);
        setEditingMarketing(null);
        setNewMarketing({ name: "", username: "", password: "", phone: "" });
        setQrCode(null);
        fetchUsers();
      }
    } catch (err) { alert("Terjadi kesalahan koneksi"); }
  };

  const handleDeleteMarketing = async (id) => {
    if (!confirm("Hapus marketing ini? Client yang dipegang akan kembali ke antrean.")) return;
    try {
      const res = await fetch(`/api/user/${id}`, { method: 'DELETE' });
      if (res.ok) fetchUsers();
    } catch (err) { alert("Gagal menghapus user"); }
  };

    const openEditModal = (marketing) => {
    setEditingMarketing(marketing);
    setNewMarketing({ 
      name: marketing.full_name || "", 
      username: marketing.username || "", 
      password: "", 
      phone: marketing.phone_number || "" // <-- Ubah dari marketing.phone menjadi marketing.phone_number
    });
    setIsModalOpen(true);
  };

  const handleAssignSubmit = async (customerId) => {
    if (!selectedMarketingId) return alert("Pilih marketing!");
    try {
      const response = await fetch(`/api/customer/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketing_id: parseInt(selectedMarketingId) }),
      });
      if (response.ok) { 
        fetchCustomers(); 
        setSelectedMarketingId(""); 
      }
    } catch (err) { alert("Gagal melakukan assignment"); }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans overflow-hidden">
      
      {/* OVERLAY MOBILE */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden transition-opacity" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* MODAL TAMBAH/EDIT MARKETING */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-slideUp">
            <div className="p-6 bg-gradient-to-r from-orange-600 to-orange-700">
              <h3 className="text-xl font-black text-white text-center tracking-tight">
                {editingMarketing ? '✏️ Update Data Tim' : '➕ Tambah Marketing Baru'}
              </h3>
            </div>
            <form onSubmit={handleAddMarketing} className="p-6 space-y-4">
              {/* ROW 1: Nama & No. WhatsApp */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">Nama Lengkap</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Nama Marketing"
                    // PERBAIKAN: Pastikan menggunakan newMarketing.name
                    value={newMarketing.name || ""} 
                    onChange={(e) => setNewMarketing({...newMarketing, name: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">No. WhatsApp</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="62812xxx"
                    // PERBAIKAN: Pastikan menggunakan newMarketing.phone
                    value={newMarketing.phone || ""} 
                    onChange={(e) => setNewMarketing({...newMarketing, phone: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* BAGIAN SCAN QR */}
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                <div className="flex flex-col items-center justify-center min-h-[160px] bg-white rounded-xl shadow-inner border border-slate-100 p-2">
                  {waStatuses[newMarketing.username] === 'Connected' ? (
                    <div className="flex flex-col items-center animate-fadeIn">
                      <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-2 shadow-sm border border-green-200">
                        ✅
                      </div>
                      <p className="text-xs font-black text-green-600 uppercase">WhatsApp Terhubung</p>
                    </div>
                  ) : qrCode ? (
                    <img src={qrCode} alt="WhatsApp QR" className="w-32 h-32 rounded-lg shadow-md" />
                  ) : (
                    <div className="text-gray-400 flex flex-col items-center py-4">
                      <div className="text-3xl mb-2">📲</div>
                      <p className="text-[10px] font-bold leading-tight px-4">
                        {isConnecting ? "Membangun koneksi..." : "Isi username dulu sebelum hubungkan WA"}
                      </p>
                    </div>
                  )}
                </div>

                <button 
                  type="button"
                  onClick={() => handleGetQR(newMarketing.username)}
                  disabled={isConnecting || !newMarketing.username || waStatuses[newMarketing.username] === 'Connected'}
                  className="mt-3 w-full py-2 bg-white border border-slate-200 text-orange-600 text-[10px] font-black uppercase rounded-lg hover:bg-orange-50 disabled:opacity-30 transition-all active:scale-95"
                >
                  {waStatuses[newMarketing.username] === 'Connected' ? "Terkoneksi Sempurna" : qrCode ? "🔄 Refresh QR" : "🔗 Hubungkan WhatsApp Sekarang"}
                </button>
              </div>

              {/* ROW 2: Username & Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">Username Login</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="jokowow"
                    value={newMarketing.username} 
                    onChange={(e) => setNewMarketing({...newMarketing, username: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">Password</label>
                  <input 
                    type="password" 
                    placeholder={editingMarketing ? "Kosongkan jika tak diubah" : "Min. 6 karakter"}
                    value={newMarketing.password} 
                    onChange={(e) => setNewMarketing({...newMarketing, password: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsModalOpen(false); setQrCode(null); setEditingMarketing(null); }} 
                  className="flex-1 py-3 text-xs font-bold text-gray-500 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95"
                >
                  💾 Simpan Data Marketing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed lg:relative z-[70] w-72 h-full bg-white shadow-2xl flex flex-col
        transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        
        {/* Sidebar Header */}
        <div className="p-5 border-b bg-gradient-to-r from-orange-600 to-orange-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">IBMP CRM</h2>
            <p className="text-xs text-orange-100 font-semibold mt-0.5">Admin Panel</p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="lg:hidden text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 flex-1">
          {[
            { id: "dashboard", icon: "📊", label: "Performa Tim" },
            { id: "assignment", icon: "📩", label: "Assign Client" },
            { id: "monitor", icon: "💬", label: "Monitor Chat" },
          ].map((item) => (
            <button 
              key={item.id} 
              onClick={() => { 
                setActiveTab(item.id); 
                setIsSidebarOpen(false); 
              }} 
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-semibold text-sm
                ${activeTab === item.id 
                  ? "bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg shadow-orange-200" 
                  : "text-gray-600 hover:bg-slate-100"
                }`}
            >
              <span className="text-lg">{item.icon}</span> 
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t bg-slate-50 space-y-2">
          <button 
            onClick={() => { 
              setEditingMarketing(null); 
              setNewMarketing({ name: "", username: "", password: "", phone: "" }); 
              setIsModalOpen(true); 
            }} 
            className="w-full py-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            ➕ Tambah Tim Baru
          </button>
          <button 
              onClick={handleLogoutAdmin} 
              className="w-full flex items-center justify-center gap-2 py-3 text-red-500 font-bold text-sm hover:bg-red-50 rounded-xl transition-colors"
            >
              🚪 Logout Admin
            </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* HEADER */}
        <header className="p-4 bg-white border-b shadow-sm flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="lg:hidden text-2xl text-gray-600 hover:text-orange-600 transition-colors"
            >
              ☰
            </button>
            <h1 className="text-lg md:text-xl font-black text-gray-800 capitalize">
              {activeTab === "dashboard" && "📊 Dashboard"}
              {activeTab === "assignment" && "📩 Assignment"}
              {activeTab === "monitor" && "💬 Monitor"}
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-bold text-green-700 hidden sm:inline">WA Gateway Online</span>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-2xl">
                      👥
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Marketing Aktif</p>
                  <h2 className="text-4xl font-black text-gray-800">
                    {teamStats.filter((u) => u.role === 'marketing').length}
                  </h2>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl">
                      📞
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Client</p>
                  <h2 className="text-4xl font-black text-gray-800">{customers.length}</h2>
                </div>
              </div>

              {/* Team Performance Table */}
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-slate-100">
                  <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wide">Data Performa Tim</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-gray-600 text-xs uppercase font-bold border-b">
                      <tr>
                        <th className="px-4 md:px-6 py-3">Marketing</th>
                        <th className="px-4 md:px-6 py-3 text-center">Handling</th>
                        <th className="px-4 md:px-6 py-3 text-center hidden sm:table-cell">Avg. Respon</th>
                        <th className="px-4 md:px-6 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamStats.filter((u) => u.role === 'marketing').length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                            <div className="text-4xl mb-2">👤</div>
                            <p className="text-sm font-semibold">Belum ada tim marketing</p>
                          </td>
                        </tr>
                      ) : (
                        teamStats.filter((u) => u.role === 'marketing').map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 md:px-6 py-4">
                              <div className="flex items-center gap-3">
                                {/* LAMPU INDIKATOR */}
                                <div 
                                  className={`w-3 h-3 rounded-full shrink-0 ${
                                    waStatuses[m.username] === 'Connected' 
                                      ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' 
                                      : 'bg-red-500'
                                  }`} 
                                  title={waStatuses[m.username] || 'Checking...'}
                                />
                                <div>
                                  <p className="font-bold text-gray-800">{m.full_name}</p>
                                  <p className="text-xs text-gray-500">@{m.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 md:px-6 py-4 text-center">
                              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                {getClientCount(m.id)} Client
                              </span>
                            </td>
                            <td className="px-4 md:px-6 py-4 text-center hidden sm:table-cell">
                              <span className="text-sm font-bold text-green-600">
                                {getAverageResponseTime(m.id)}
                              </span>
                            </td>
                            <td className="px-4 md:px-6 py-4">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => openEditModal(m)} 
                                  className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => handleDeleteMarketing(m.id)} 
                                  className="text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ASSIGNMENT */}
          {activeTab === "assignment" && (
            <div className="max-w-5xl mx-auto">
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-slate-100 flex flex-wrap justify-between items-center gap-2">
                  <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wide">Antrian Client Baru</h3>
                  <span className="text-xs font-bold bg-orange-600 text-white px-3 py-1 rounded-full uppercase">
                    Action Needed
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase font-bold text-gray-600 border-b">
                      <tr>
                        <th className="px-4 md:px-6 py-3">Client</th>
                        <th className="px-4 md:px-6 py-3">Assign ke Tim</th>
                        <th className="px-4 md:px-6 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customers.filter(c => !c.marketing_id).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                            <div className="text-4xl mb-2">✅</div>
                            <p className="text-sm font-semibold">Semua client sudah ter-assign</p>
                          </td>
                        </tr>
                      ) : (
                        customers.filter(c => !c.marketing_id).map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 md:px-6 py-4">
                              <p className="font-bold text-gray-800">{c.full_name || c.name}</p>
                              <p className="text-xs text-gray-500">{c.phone_number}</p>
                            </td>
                            <td className="px-4 md:px-6 py-4">
                              <select 
                                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                                value={selectedMarketingId} 
                                onChange={(e) => setSelectedMarketingId(e.target.value)}
                              >
                                <option value="">-- Pilih Marketing --</option>
                                {teamStats.filter((u) => u.role === 'marketing').map((m) => (
                                  <option key={m.id} value={m.id}>{m.full_name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 md:px-6 py-4 text-right">
                              <button 
                                onClick={() => handleAssignSubmit(c.id)} 
                                className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MONITOR CHAT */}
          {activeTab === "monitor" && (
            <div className="space-y-4 h-full flex flex-col max-w-7xl mx-auto">
              
              {/* Filter Marketing */}
              <div className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 ${selectedClientChat ? 'hidden lg:flex' : 'flex'}`}>
                <div>
                  <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wide">Live Monitor</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Pantau percakapan tim realtime</p>
                </div>
                <select 
                  className="w-full sm:w-auto p-3 border border-slate-200 rounded-xl text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-orange-500"
                  value={monitoredMarketingId}
                  onChange={(e) => { 
                    setMonitoredMarketingId(e.target.value); 
                    setSelectedClientChat(null); 
                  }}
                >
                  <option value="">-- Pilih Marketing --</option>
                  {teamStats.filter((u) => u.role === 'marketing').map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              {monitoredMarketingId ? (
                <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
                  
                  {/* Client List */}
                  <div className={`w-full lg:w-80 bg-white rounded-2xl border shadow-lg overflow-hidden flex flex-col ${selectedClientChat ? 'hidden lg:flex' : 'flex'}`}>
                    <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-slate-100">
                      <p className="font-bold text-xs text-gray-700 uppercase tracking-wide">Daftar Client</p>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {customers.filter(c => c.marketing_id === parseInt(monitoredMarketingId)).length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                          <div className="text-4xl mb-2">📭</div>
                          <p className="text-sm font-semibold">Belum ada client</p>
                        </div>
                      ) : (
                        customers.filter(c => c.marketing_id === parseInt(monitoredMarketingId)).map((client) => (
                          <button 
                            key={client.id} 
                            onClick={() => setSelectedClientChat(client)} 
                            className={`w-full p-4 text-left border-b flex items-center gap-3 transition-all ${selectedClientChat?.id === client.id ? 'bg-orange-50 border-l-4 border-l-orange-600' : 'hover:bg-slate-50'}`}
                          >
                            <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-700 text-white rounded-full flex items-center justify-center font-bold shadow-md shrink-0">
                              {(client.full_name || "C")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 truncate">{client.full_name}</p>
                              <p className="text-xs text-gray-500 truncate">Klik untuk monitor</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className={`flex-1 bg-white rounded-2xl border shadow-lg flex flex-col overflow-hidden ${!selectedClientChat ? 'hidden lg:flex' : 'flex'}`}>
                    {selectedClientChat ? (
                      <>
                        {/* Chat Header */}
                        <div className="p-4 border-b bg-white flex items-center gap-3 shadow-sm shrink-0">
                          <button 
                            onClick={() => setSelectedClientChat(null)} 
                            className="lg:hidden p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          >
                            ←
                          </button>
                          <div className="w-11 h-11 bg-gradient-to-br from-orange-600 to-orange-700 text-white rounded-full flex items-center justify-center font-bold shadow-md">
                            {(selectedClientChat.full_name || "C")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-gray-800 truncate">{selectedClientChat.full_name}</h4>
                            <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                              Connected
                            </p>
                          </div>
                        </div>

                        {/* Chat Messages */}
                        <div 
                          className="flex-1 p-4 md:p-6 space-y-3 overflow-y-auto custom-scrollbar bg-[#e5ddd5]"
                          style={{ 
                            backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                            backgroundBlendMode: "overlay",
                            backgroundColor: "#e5ddd5"
                          }}
                        >
                          {chatMessages.map((msg, index) => {
                            const currentDate = new Date(msg.created_at).toLocaleDateString('id-ID');
                            const prevDate = index > 0 
                              ? new Date(chatMessages[index - 1].created_at).toLocaleDateString('id-ID')
                              : null;
                            const isNewDay = currentDate !== prevDate;

                            return (
                              <div key={msg.id} className="flex flex-col">
                                {isNewDay && (
                                  <div className="flex justify-center my-4">
                                    <span className="bg-white/90 backdrop-blur-sm text-gray-600 text-xs px-4 py-1.5 rounded-full font-semibold shadow-sm">
                                      {currentDate}
                                    </span>
                                  </div>
                                )}

                                <div className={`flex ${msg.sender_type === 'marketing' ? 'justify-end' : 'justify-start'} mb-2`}>
                                  <div className={`max-w-[85%] md:max-w-[70%] p-3 px-4 rounded-2xl shadow-md text-xs relative ${
                                    msg.sender_type === 'marketing' 
                                      ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-sm' 
                                      : 'bg-white text-gray-800 rounded-tl-sm'
                                  }`}>
                                    
                                    {/* Sender Label */}
                                    <p className={`text-[9px] font-black uppercase mb-1 ${
                                      msg.sender_type === 'marketing' ? 'text-green-600' : 'text-blue-600'
                                    }`}>
                                      {msg.sender_type === 'marketing' ? 'Marketing' : 'Customer'}
                                    </p>

                                    {/* Media Content */}
                                    {msg.image_url && (
                                      <div className="mb-2">
                                        {(() => {
                                          const fileName = msg.image_url;
                                          const secureUrl = `/api/chat/media?file=${fileName}`;
                                          const urlLower = fileName.toLowerCase();
                                          
                                          // Video
                                          if (urlLower.match(/\.(mp4|mov|avi|webm|mkv)$/) || msg.message_text === "[Video]") {
                                            return (
                                              <div className="rounded-xl overflow-hidden shadow-md border border-black/10">
                                                <video controls className="max-w-full max-h-64">
                                                  <source src={secureUrl} type="video/mp4" />
                                                  Browser tidak support video.
                                                </video>
                                              </div>
                                            );
                                          }
                                          
                                          // Audio
                                          if (urlLower.match(/\.(ogg|mp3|wav|m4a|webm)$/) || msg.message_text === "[Pesan Suara]") {
                                            return (
                                              <div className="flex items-center gap-2 bg-black/5 p-3 rounded-xl border border-black/10">
                                                <span className="text-xl">🎤</span>
                                                <audio controls className="h-8 w-48 md:w-64">
                                                  <source src={secureUrl} type="audio/ogg" />
                                                  Browser tidak support audio.
                                                </audio>
                                              </div>
                                            );
                                          }

                                          // Document
                                          if (urlLower.match(/\.(pdf|doc|docx|xls|xlsx|csv|txt)$/)) {
                                            return (
                                              <div 
                                                onClick={() => window.open(secureUrl, '_blank')} 
                                                className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white cursor-pointer shadow-md hover:shadow-lg transition-all"
                                              >
                                                <span className="text-2xl">📄</span>
                                                <span className="text-xs font-bold truncate">Download Dokumen</span>
                                              </div>
                                            );
                                          }
                                          
                                          // Image (default)
                                          return (
                                            <img 
                                              src={secureUrl} 
                                              className="max-w-full rounded-xl shadow-md border border-black/10 cursor-pointer hover:opacity-90 transition-opacity" 
                                              alt="media"
                                              onClick={() => window.open(secureUrl, '_blank')}
                                              onError={(e) => {
                                                e.target.src = "https://via.placeholder.com/150?text=Media+Error";
                                              }}
                                            />
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {/* Text Message */}
                                    {msg.message_text && 
                                      msg.message_text !== "[Gambar]" && 
                                      msg.message_text !== "[Pesan Suara]" && 
                                      msg.message_text !== "[Video]" && (
                                        <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.message_text}</p>
                                      )}

                                    {/* Timestamp & Status */}
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
                            );
                          })}
                          <div ref={chatEndRef} />
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-slate-50 to-slate-100">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-5xl mb-4 shadow-lg">
                          💬
                        </div>
                        <h4 className="font-bold text-gray-700 text-base mb-2">Pilih Client</h4>
                        <p className="text-sm text-gray-500 max-w-xs">Pilih client dari daftar untuk melihat percakapan</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl text-center p-8">
                  <div>
                    <div className="text-5xl mb-3 opacity-30">👥</div>
                    <p className="font-bold text-sm text-gray-400 uppercase tracking-wide">Pilih Marketing di atas untuk memulai monitoring</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* CUSTOM SCROLLBAR */}
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

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}