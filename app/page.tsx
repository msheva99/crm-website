import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* Logo Section */}
      <div className="mb-10">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={150}
          height={30}
          priority
        />
      </div>

      {/* Main Login Card */}
      <main className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Selamat Datang</h1>
          <p className="text-gray-500 mt-2">Silakan pilih jenis akses Anda</p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Opsi Login User */}
          <a
            href="/user" 
            className="group flex items-center justify-between p-4 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-500 transition-colors">
                <svg className="w-6 h-6 text-blue-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="block font-bold text-gray-800">Masuk sebagai Mitra</span>
                <span className="text-xs text-gray-500">Cek stok & pesan bumbu</span>
              </div>
            </div>
            <span className="text-gray-400 group-hover:text-blue-500">→</span>
          </a>

          {/* Opsi Login Admin */}
          <a
            href="/admin/"
            className="group flex items-center justify-between p-4 border-2 border-gray-100 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-500 transition-colors">
                <svg className="w-6 h-6 text-orange-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="block font-bold text-gray-800">Masuk sebagai Admin</span>
                <span className="text-xs text-gray-500">Kelola database & pengiriman</span>
              </div>
            </div>
            <span className="text-gray-400 group-hover:text-orange-500">→</span>
          </a>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="mt-8 text-gray-400 text-sm">
        &copy; 2026 Dashboard Stok Mitra
      </footer>
    </div>
  );
}