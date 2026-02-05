import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// 1. AMBIL DATA CUSTOMER (OPTIMAL UNTUK CHAT)
export async function GET() {
  try {
    // [PERBAIKAN] Urutkan berdasarkan last_interaction DESC
    // Agar customer yang baru chat/dibalas muncul paling atas
    const result = await query(
      'SELECT * FROM crm_website.customers ORDER BY last_interaction DESC NULLS LAST, id DESC'
    );
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. TAMBAH CUSTOMER BARU
export async function POST(req: Request) {
  try {
    const { phone_number, full_name, source } = await req.json();
    
    // [PERBAIKAN] Tambahkan last_interaction = NOW() saat insert awal
    // Gunakan ON CONFLICT agar jika admin input nomor yang sudah ada (dari webhook), tidak error 500
    const result = await query(
      `INSERT INTO crm_website.customers (phone_number, full_name, source, last_interaction) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (phone_number) 
       DO UPDATE SET full_name = EXCLUDED.full_name, last_interaction = NOW()
       RETURNING *`,
      [phone_number, full_name, source || 'Manual Input']
    );
    
    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error("Error inserting customer:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}