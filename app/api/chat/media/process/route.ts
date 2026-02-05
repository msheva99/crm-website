import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { s3Client } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const maxDuration = 300; // 5 menit untuk video besar
export const dynamic = 'force-dynamic';

const getFileExtension = (mimetype: string) => {
  if (mimetype.includes("pdf")) return "pdf";
  if (mimetype.includes("msword") || mimetype.includes("officedocument.wordprocessingml")) return "docx";
  if (mimetype.includes("excel") || mimetype.includes("officedocument.spreadsheetml")) return "xlsx";
  if (mimetype.includes("image/jpeg") || mimetype.includes("image/jpg")) return "jpg";
  if (mimetype.includes("image/png")) return "png";
  if (mimetype.includes("audio/ogg") || mimetype.includes("audio/mpeg")) return "ogg";
  if (mimetype.includes("video/mp4")) return "mp4";
  if (mimetype.includes("video/")) return "mp4";
  return mimetype.split("/")[1] || "bin";
};

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const { messageId, endpoint, mediaObject } = await request.json();
    
    console.log(`[MEDIA] 🎬 Processing ${endpoint} for message ${messageId}`);
    
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[MEDIA] 🔄 Attempt ${attempt}/${maxRetries}`);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2 menit per attempt
        
        try {
          const resDownload = await fetch(`https://wuzapi.ibmpgroup.com/chat/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': 'Indoboga@2026' },
            body: JSON.stringify({
              "Url": mediaObject.URL || mediaObject.url,
              "DirectPath": mediaObject.directPath || mediaObject.DirectPath,
              "MediaKey": mediaObject.mediaKey || mediaObject.MediaKey,
              "Mimetype": mediaObject.mimetype || mediaObject.Mimetype,
              "FileEncSHA256": mediaObject.fileEncSHA256 || mediaObject.FileEncSHA256,
              "FileSHA256": mediaObject.fileSHA256 || mediaObject.FileSHA256,
              "FileLength": Number(mediaObject.fileLength || 0)
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          
          const downloadData = await resDownload.json();
          const base64Raw = downloadData.data?.Data || downloadData.data || downloadData.Data;

          if (downloadData.success && base64Raw) {
            const ext = getFileExtension(mediaObject.mimetype || "");
            const safeFileName = `${Date.now()}_file.${ext}`;
            const cleanBase64 = base64Raw.includes('base64,') ? base64Raw.split('base64,').pop() : base64Raw;
            
            console.log(`[MEDIA] 📤 Uploading to S3: ${safeFileName}`);
            
            await s3Client.send(new PutObjectCommand({
              Bucket: "crmweb", 
              Key: safeFileName, 
              Body: Buffer.from(cleanBase64, 'base64'),
              ContentType: mediaObject.mimetype || 'application/octet-stream',
            }));
            
            await query(
              `UPDATE crm_website.messages SET image_url = $1 WHERE id = $2`,
              [safeFileName, messageId]
            );
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[MEDIA] ✅ Success: ${safeFileName} for message ${messageId} (${elapsed}s)`);
            
            return NextResponse.json({ 
              success: true, 
              file: safeFileName,
              duration: elapsed 
            });
          } else {
            throw new Error('Download failed: No data received');
          }
          
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === 'AbortError') {
            console.error(`[MEDIA] ⏱️ Timeout on attempt ${attempt}`);
          } else {
            throw fetchErr;
          }
        }
        
      } catch (err: any) {
        console.error(`[MEDIA] ❌ Attempt ${attempt} failed:`, err.message);
        
        if (attempt < maxRetries) {
          console.log(`[MEDIA] 🔄 Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    // Semua retry gagal
    await query(
      `UPDATE crm_website.messages SET message_text = $1 WHERE id = $2`,
      ['[Video - Gagal diunduh]', messageId]
    );
    
    console.error(`[MEDIA] ❌ All retries failed for message ${messageId}`);
    return NextResponse.json({ 
      success: false, 
      error: 'All retries failed' 
    }, { status: 500 });
    
  } catch (error: any) {
    console.error(`[MEDIA] ❌ Error:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}