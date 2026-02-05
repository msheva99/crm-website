import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { id_lokal, whatsappId, phone } = await request.json();

    // 1. PENANGANAN PESAN TANPA ID (PESAN LAMA)
    if (!whatsappId) {
      // Jika id_whatsapp kosong, hapus saja di database lokal agar hilang dari UI
      await query(`DELETE FROM crm_website.messages WHERE id = $1`, [id_lokal]);
      return NextResponse.json({ 
        success: true, 
        message: "Pesan lama dihapus dari database lokal" 
      });
    }

    // 2. PROSES HAPUS DI WHATSAPP VIA WUZAPI
    const wuzapiRes = await fetch(`https://wuzapi.ibmpgroup.com/chat/delete`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'token': 'Indoboga@2026' 
      },
      body: JSON.stringify({
        "ID": whatsappId, // Wuzapi mewajibkan key "ID" besar
        "Phone": phone
      }),
    });

    const result = await wuzapiRes.json();

    // 3. LOGIKA FINAL
    if (result.success || result.code === 200) {
      // Jika sukses tarik di WA, hapus di database lokal
      await query(`DELETE FROM crm_website.messages WHERE id = $1`, [id_lokal]);
      return NextResponse.json({ success: true });
    } else {
      // Jika gagal di WA (misal pesan > 48 jam), tetap hapus di lokal agar UI bersih
      await query(`DELETE FROM crm_website.messages WHERE id = $1`, [id_lokal]);
      return NextResponse.json({ 
        success: true, 
        warning: "Berhasil hapus di lokal, tapi gagal tarik di WhatsApp (Pesan mungkin sudah lama)" 
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}