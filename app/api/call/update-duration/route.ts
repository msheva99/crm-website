// app/api/call/update-duration/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getLogTime() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export async function POST(request: Request) {
  const time = getLogTime();
  try {
    const body = await request.json();
    const { messageId, duration } = body;
    
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }
    
    // Jika ada durasi manual, update langsung
    if (duration && duration > 0) {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const messageText = `📞 Panggilan: Selesai (${mins}:${secs.toString().padStart(2, '0')})`;
      
      await query(
        `UPDATE crm_website.messages 
         SET message_text = $1, call_duration = $2 
         WHERE id = $3`,
        [messageText, duration, messageId]
      );
      
      console.log(`[${time}] ✅ Manual update: ${duration}s for message ${messageId}`);
      return NextResponse.json({ success: true, duration });
    }
    
    // Jika tidak ada durasi manual, hitung dari call_started_at
    const result = await query(
      `SELECT call_started_at FROM crm_website.messages WHERE id = $1`,
      [messageId]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    
    const callStarted = result.rows[0].call_started_at;
    
    if (!callStarted) {
      return NextResponse.json({ error: "Call not started" }, { status: 400 });
    }
    
    // Hitung durasi dari call_started_at sampai sekarang
    const startTime = new Date(callStarted).getTime();
    const endTime = Date.now();
    const calculatedDuration = Math.floor((endTime - startTime) / 1000);
    
    const mins = Math.floor(calculatedDuration / 60);
    const secs = calculatedDuration % 60;
    const messageText = `📞 Panggilan: Selesai (${mins}:${secs.toString().padStart(2, '0')})`;
    
    await query(
      `UPDATE crm_website.messages 
       SET message_text = $1, call_duration = $2 
       WHERE id = $3`,
      [messageText, calculatedDuration, messageId]
    );
    
    console.log(`[${time}] ✅ Auto update: ${calculatedDuration}s for message ${messageId}`);
    return NextResponse.json({ success: true, duration: calculatedDuration });
    
  } catch (error: any) {
    console.error(`[${time}] ❌ Error updating call duration:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint untuk update semua panggilan yang masih "Tersambung"
export async function GET() {
  const time = getLogTime();
  try {
    // Cari semua panggilan yang masih "Tersambung" dan sudah > 5 menit
    const result = await query(
      `SELECT id, call_started_at 
       FROM crm_website.messages 
       WHERE message_text LIKE '%Tersambung%' 
       AND call_started_at IS NOT NULL 
       AND call_started_at < NOW() - INTERVAL '5 minutes'`
    );
    
    let updated = 0;
    
    for (const row of result.rows) {
      const startTime = new Date(row.call_started_at).getTime();
      const endTime = Date.now();
      const duration = Math.floor((endTime - startTime) / 1000);
      
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const messageText = `📞 Panggilan: Selesai (${mins}:${secs.toString().padStart(2, '0')})`;
      
      await query(
        `UPDATE crm_website.messages 
         SET message_text = $1, call_duration = $2 
         WHERE id = $3`,
        [messageText, duration, row.id]
      );
      
      updated++;
    }
    
    console.log(`[${time}] ✅ Auto-updated ${updated} active calls`);
    return NextResponse.json({ success: true, updated });
    
  } catch (error: any) {
    console.error(`[${time}] ❌ Error in bulk update:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}