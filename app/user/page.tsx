"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";

export default function UserLogin() {
  const router = useRouter();
  
  // Perhatikan nama state di bawah ini (sudah disamakan dengan input)
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState(""); 
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); 
    setLoading(true);

    try {
      const response = await fetch('/api/user');
      const users = await response.json();

      const foundUser = users.find(
        (u: any) => u.username === usernameInput && u.password === passwordInput
      );

      if (foundUser) {
        if (foundUser.role === 'marketing') {
          // --- TAMBAHKAN BAGIAN INI ---
          // Simpan data user ke dalam Cookie selama 1 hari
          Cookies.set("user_session", JSON.stringify({
            id: foundUser.id,
            username: foundUser.username,
            full_name: foundUser.full_name,
            role: foundUser.role
          }), { expires: 1 }); 
          // ----------------------------

          router.push("/duser");
        } else {
          setError("Akses ditolak. Akun ini bukan akun Marketing.");
        }
      } else {
        setError("Username atau Password database salah!");
      }
    } catch (err) {
      setError("Gagal terhubung ke database.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-6 text-gray-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 border-t-4 border-blue-600">
        <Link href="/" className="text-blue-600 text-sm font-medium hover:underline mb-6 inline-block">
          ← Kembali ke Beranda
        </Link>
        
        <h2 className="text-2xl font-bold mb-2">Login Marketing</h2>
        <p className="text-gray-500 mb-8 text-sm">Gunakan akun database Anda.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-600 text-xs rounded-lg font-bold border border-red-200">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username Marketing</label>
            <input 
              type="text" 
              required
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Contoh: mkt-danan"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
            <input 
              type="password" 
              required
              value={passwordInput} // Menggunakan passwordInput
              onChange={(e) => setPasswordInput(e.target.value)} // Menggunakan setPasswordInput
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Masukkan password"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2`}
          >
            {loading ? "Memvalidasi Database..." : "Masuk Sekarang"}
          </button>
        </form>
      </div>
    </div>
  );
}