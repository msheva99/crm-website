"use client";
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [marketings, setMarketings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customer')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMarketings(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold text-gray-800">Daftar Tim Marketing</h1>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            + Tambah User
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          <table className="min-w-full leading-normal">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Nama Lengkap</th>
                <th className="px-5 py-3">Username</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Dibuat Pada</th>
              </tr>
            </thead>
            <tbody>
              {marketings.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 border-b border-gray-200">
                  <td className="px-5 py-4 text-sm font-bold text-gray-700">{user.id}</td>
                  <td className="px-5 py-4 text-sm text-gray-700">{user.full_name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.username}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}