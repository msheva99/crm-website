import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = `
      SELECT 
        m.*, 
        c.full_name, 
        c.phone_number 
      FROM crm_website.messages m
      JOIN crm_website.customers c ON m.customer_id = c.id
      WHERE m.sender_type = 'customer' 
      AND m.message_text NOT LIKE '%CallRelayLatency%'
      AND m.message_text NOT LIKE '%Status: Call%'
      ORDER BY m.created_at DESC
      LIMIT 100
    `;
    
    const result = await query(sql);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching messages:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}