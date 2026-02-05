import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// AMBIL SEMUA USER
export async function GET() {
  try {
    const result = await query('SELECT * FROM crm_website.users ORDER BY id DESC');
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// TAMBAH USER BARU
export async function POST(req: Request) {
  try {
    // 1. Tambahkan phone_number ke dalam destrukturisasi object
    const { username, password, full_name, role, phone_number } = await req.json(); 

    // 2. Update Query SQL untuk menyertakan kolom phone_number
    // Sertakan juga wuzapi_session (biasanya diisi username) agar sinkron dengan kebutuhan CRM kamu
    const result = await query(
      `INSERT INTO crm_website.users (username, password, full_name, role, phone_number, wuzapi_session, connection_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [username, password, full_name, role, phone_number, username, 'Disconnected']
    );

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error("Database Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}