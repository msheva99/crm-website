import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    // Konversi file ke Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Nama file aman
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

    const params = {
      Bucket: "crmweb",
      Key: fileName,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    };

    // Upload ke MinIO
    await s3Client.send(new PutObjectCommand(params));

    // --- PERBAIKAN DI SINI ---
    // Jangan kirim URL lengkap, kirim NAMA FILENYA saja.
    // Ini supaya di database hanya tersimpan nama file, 
    // lalu frontend akan memanggilnya lewat /api/media?file=...
    return NextResponse.json({ 
      success: true, 
      url: fileName 
    });

  } catch (error: any) {
    console.error("Error upload ke MinIO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}