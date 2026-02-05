import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = searchParams.get('session'); // Nama Marketing

  if (!session) return NextResponse.json({ error: "Session required" }, { status: 400 });

  const WUZAPI_URL = "http://localhost:8080";
  const ADMIN_TOKEN = "Indoboga@2025";
  // Kita asumsikan Token User sama dengan Admin Token agar simpel, 
  // atau kamu bisa buat unik per marketing.
  const USER_TOKEN = `token_${session}`;

  try {
    // LANGKAH 1: Daftarkan User/Marketing ke sistem Wuzapi (POST /admin/users)
    await fetch(`${WUZAPI_URL}/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: session,
        token: USER_TOKEN, // Ini kunci yang dipakai untuk ambil QR nanti
        events: "All"
      })
    });

    // LANGKAH 2: Pastikan Session Connect (POST /session/connect)
    await fetch(`${WUZAPI_URL}/session/connect`, {
      method: 'POST',
      headers: {
        'token': USER_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // LANGKAH 3: Ambil Data QR (GET /session/qr)
    const response = await fetch(`${WUZAPI_URL}/session/qr`, {
      method: 'GET',
      headers: { 'token': USER_TOKEN }
    });

    const data = await response.json();

    // Ambil string base64 QR dari JSON
    const qrCode = data.QRCode || data.urlCode || data.data?.QRCode;

    if (!qrCode) {
      return NextResponse.json({ error: "QR belum siap, coba klik lagi" }, { status: 500 });
    }

    // Karena Wuzapi versi ini mengembalikan JSON berisi Base64, 
    // kita kirim balik JSON-nya ke Frontend
    return NextResponse.json({ qr: qrCode });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Gagal menyambung ke Wuzapi" }, { status: 500 });
  }
}