import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marketingId = searchParams.get("marketingId");

  if (!marketingId) {
    return NextResponse.json({ error: "Marketing ID required" }, { status: 400 });
  }

  try {
    // Query ini menghitung total customer unik yang berinteraksi dengan marketing tersebut HARI INI
    const result = await query(
      `SELECT COUNT(DISTINCT customer_id) as total 
       FROM crm_website.messages 
       WHERE marketing_id = $1 
       AND created_at >= CURRENT_DATE`,
      [marketingId]
    );

    const totalInteracted = parseInt(result.rows[0]?.total || "0");

    return NextResponse.json({ 
      success: true, 
      totalInteracted 
    });
    
  } catch (error: any) {
    console.error("Stats API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}