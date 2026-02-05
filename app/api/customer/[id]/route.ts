import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(
  req: Request,
  // 1. Ubah tipe data params menjadi Promise
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 2. Gunakan await untuk mengambil data dari params
    const resolvedParams = await params;
    const id = resolvedParams.id;
    
    const { marketing_id } = await req.json();

    const result = await query(
      'UPDATE crm_website.customers SET marketing_id = $1 WHERE id = $2 RETURNING *',
      [marketing_id, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error("PATCH Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}