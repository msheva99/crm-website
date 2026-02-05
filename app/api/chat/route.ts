import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) return NextResponse.json({ error: "Missing customerId" }, { status: 400 });

    const sql = `
      SELECT * FROM crm_website.messages 
      WHERE customer_id = $1 
      AND message_text NOT LIKE '%CallRelayLatency%'
      ORDER BY created_at ASC`;
      
    const result = await query(sql, [customerId]);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_id, marketing_id, sender_type, content, sendToWhatsApp, phone, image_url } = body;

    let whatsappId = null;

    if (sendToWhatsApp && phone) {
      const cleanNumber = phone.replace(/[^0-9]/g, "");
      const userRes = await query("SELECT username FROM crm_website.users WHERE id = $1", [marketing_id]);
      const username = userRes.rows[0]?.username;

      if (username) {
        const WUZAPI_URL = "http://localhost:8080"; 
        const USER_TOKEN = `token_${username}`; 
        const isImage = !!image_url;
        const endpoint = isImage ? "image" : "text";
        const wuzapiEndpoint = `${WUZAPI_URL}/chat/send/${endpoint}`;

        // SESUAIKAN DENGAN ERROR: Pakai Phone dan Body (Huruf Besar)
        const payload = isImage 
          ? { "Phone": cleanNumber, "Image": image_url, "Caption": content || "" }
          : { "Phone": cleanNumber, "Body": content }; 

        try {
          const wuzapiRes = await fetch(wuzapiEndpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'token': USER_TOKEN 
            },
            body: JSON.stringify(payload),
          });

          const wuzapiData = await wuzapiRes.json();
          if (wuzapiData.success) {
            whatsappId = wuzapiData.data?.id || wuzapiData.id;
            console.log(`✅ [${username}] Berhasil kirim ke WA`);
          } else {
            console.error(`❌ [${username}] Wuzapi menolak:`, wuzapiData);
          }
        } catch (err: any) {
          console.error("⚠️ Gagal konek Wuzapi. Cek SSH Tunnel!");
        }
      }
    }

    const sqlInsert = `
      INSERT INTO crm_website.messages (customer_id, marketing_id, sender_type, message_text, image_url, id_whatsapp) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    
    const dbResult = await query(sqlInsert, [customer_id, marketing_id, sender_type, content, image_url || null, whatsappId]);
    await query(`UPDATE crm_website.customers SET last_interaction = NOW() WHERE id = $1`, [customer_id]);

    return NextResponse.json(dbResult.rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}