import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// 1. UPDATE USER (PATCH)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // REVISI: Pastikan menggunakan phone_number sesuai kolom di database
    const { username, password, full_name, role, phone_number } = await req.json();

    let result;
    if (password) {
      // REVISI: Menggunakan phone_number=$5 (bukan phone)
      result = await query(
        'UPDATE crm_website.users SET username=$1, password=$2, full_name=$3, role=$4, phone_number=$5 WHERE id=$6 RETURNING *',
        [username, password, full_name, role, phone_number, id]
      );
    } else {
      // REVISI: Menggunakan phone_number=$4 (bukan phone)
      result = await query(
        'UPDATE crm_website.users SET username=$1, full_name=$2, role=$3, phone_number=$4 WHERE id=$5 RETURNING *',
        [username, full_name, role, phone_number, id]
      );
    }

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error("Error PATCH user:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. HAPUS USER (DELETE)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // A. KEAMANAN DATA: Lepaskan marketing_id dari customer agar kembali ke antrean
    await query('UPDATE crm_website.customers SET marketing_id = NULL WHERE marketing_id = $1', [id]);
    // B. OPSIONAL: Hapus pesan yang terkait marketing ini agar tidak error foreign key
    // Pastikan nama tabel benar (misal: 'chat_messages' atau 'messages')
    await query('DELETE FROM crm_website.messages WHERE marketing_id = $1', [id]);

    // C. Hapus user utama
    const result = await query('DELETE FROM crm_website.users WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ message: "User dan relasi data berhasil dihapus" });
  } catch (error: any) {
    console.error("Error DELETE user:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}