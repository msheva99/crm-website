"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";

export default function AdminLogin() {
  const router = useRouter();
  
  // State untuk input dan error
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Ambil data user dari API Database yang sudah kita buat
      const response = await fetch('/api/user');
      const users = await response.json();

      if (!response.ok) throw new Error("Gagal mengambil data user");

      // 2. Validasi Login dengan data dari Database
      const foundUser = users.find(
        (u: any) => u.username === username && u.password === password
      );

      if (foundUser) {
        // CEK APAKAH ROLE-NYA BENAR ADMIN
        if (foundUser.role === 'admin') {
          // SIMPAN SESSION ADMIN (Berlaku 1 hari)
          Cookies.set("admin_session", JSON.stringify({
            id: foundUser.id,
            username: foundUser.username,
            full_name: foundUser.full_name,
            role: foundUser.role
          }), { expires: 1 });

          router.push("/dadmin");
        } else {
          setError("Akses ditolak. Anda bukan Admin.");
        }
      } else {
        setError("Username atau Passkey salah!");
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi ke server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 border-t-8 border-orange-500">
        <Link href="/" className="text-orange-600 text-sm font-medium hover:underline mb-6 inline-block">
          ← Beranda
        </Link>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Login Admin Control</h2>
        <p className="text-gray-500 mb-8">Manajemen Distribusi Chat WhatsApp</p>

        {/* Notifikasi Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 font-bold animate-pulse">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Username</label>
            <input 
              type="text" 
              placeholder="Admin Username" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Passkey</label>
            <input 
              type="password" 
              placeholder="Passkey" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full ${loading ? 'bg-gray-400' : 'bg-orange-600 hover:bg-orange-700'} text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-200 mt-4`}
          >
            {loading ? "Mencocokkan Data..." : "Buka Panel Kontrol"}
          </button>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
          <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em]">
            Sistem Terhubung ke PostgreSQL
          </p>
        </div>
      </div>
    </div>
  );
}