import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { s3Client } from "@/lib/s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

function getLogTime() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// -------------------------------------------------------------------------
// 1. FUNGSI GET (PROXY MEDIA)
// -------------------------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileParam = searchParams.get("file");

  if (!fileParam) {
    return new Response("Nama file tidak ditemukan", { status: 400 });
  }

  if (fileParam.startsWith('data:') || fileParam.startsWith('${')) {
    return new Response("Invalid file path", { status: 400 });
  }

  const cleanFileName = fileParam
    .replace(/^\/uploads\//, '')
    .replace(/^uploads\//, '')
    .trim();

  try {
    const command = new GetObjectCommand({
      Bucket: "crmweb",
      Key: cleanFileName,
    });

    const response = await s3Client.send(command);
    const data = await response.Body?.transformToByteArray();

    if (!data) {
      return new Response("File kosong", { status: 404 });
    }

    return new Response(data, {
      headers: {
        "Content-Type": response.ContentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000",
        "Content-Disposition": "inline",
      },
    });
  } catch (error: any) {
    return new Response("File tidak ditemukan", { status: 404 });
  }
}

// -------------------------------------------------------------------------
// 2. FUNGSI POST (UPLOAD & SEND WA)
// -------------------------------------------------------------------------
export async function POST(request: Request) {
  const time = getLogTime();
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const phone = formData.get("phone") as string;
    const customerId = formData.get("customer_id");
    const marketingId = formData.get("marketing_id");
    const durationFromFront = formData.get("duration");
    const captionFromFront = formData.get("caption") as string;
    const isVoiceRecording = formData.get("is_voice") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log(`[${time}] 📥 FILE UPLOAD:`, {
      name: file.name,
      type: file.type,
      size: file.size,
      phone,
      isVoiceRecording
    });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // --- SIMPAN KE MINIO ---
    const timestamp = Date.now();
    const originalName = file.name;
    const safeFileName = `${timestamp}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: "crmweb",
      Key: safeFileName,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    }));

    const fileUrl = safeFileName;
    console.log(`[${time}] ✅ FILE SAVED TO MINIO AS: ${safeFileName}`);

    // --- IDENTIFIKASI TIPE MEDIA ---
    const isImage = file.type.startsWith("image/");
    const audioExtensions = ['.ogg', '.webm', '.m4a', '.mp3', '.opus', '.wav'];
    const hasAudioExtension = audioExtensions.some(ext => originalName.toLowerCase().endsWith(ext));
    const isAudio = file.type.startsWith("audio/") || hasAudioExtension;
    const isVideo = file.type.startsWith("video/") || 
                    originalName.endsWith(".mp4") || 
                    originalName.endsWith(".mov");
    
    let endpoint = "document";
    if (isImage) endpoint = "image";
    else if (isAudio) endpoint = "audio";
    else if (isVideo) endpoint = "video";

    console.log(`[${time}] 🔍 MEDIA TYPE: ${endpoint}`);

    // --- KONSTRUKSI PAYLOAD WUZAPI ---
    const base64String = buffer.toString('base64');
    const originalMime = file.type || "application/octet-stream";
    
    let whatsappId = null;
    let isSuccessToWA = false;
    let wuzapiError = null;

    try {
      const payload: any = { "Phone": phone };

      if (isImage) {
        const fullBase64 = `data:${originalMime};base64,${base64String}`;
        payload["Image"] = fullBase64;
        payload["Caption"] = captionFromFront || "";
        payload["FileName"] = originalName;
        
        console.log(`[${time}] 📤 IMAGE PAYLOAD`);
      } 

      else if (isAudio) {
  const voiceNoteExtensions = ['.ogg', '.opus', '.webm', '.m4a'];
  const isVoiceNoteFormat = voiceNoteExtensions.some(ext => 
    originalName.toLowerCase().endsWith(ext)
  );
  
  if (isVoiceRecording || isVoiceNoteFormat) {
    const isOggOpus = (
      (originalMime.includes('ogg') || originalName.includes('.ogg')) &&
      !originalMime.includes('webm')
    );
    
    const isProperM4aAac = (
      (originalMime.includes('mp4') || originalName.includes('.m4a')) &&
      !originalMime.includes('opus')
    );
    
    // ✅ HANYA kirim sebagai PTT jika OGG atau M4A-AAC yang proper
    // ❌ WebM TIDAK BISA jadi PTT, jadi skip
    
    if (isOggOpus || isProperM4aAac) {
      // Kirim sebagai voice note PTT
      let whatsappMimeType = isProperM4aAac ? 'audio/mp4' : 'audio/ogg; codecs=opus';
      let audioBase64Prefix = isProperM4aAac ? 'audio/mp4' : 'audio/ogg';
      let formatType = isProperM4aAac ? 'M4A/AAC' : 'OGG/Opus';
      
      payload["Audio"] = `data:${audioBase64Prefix};base64,${base64String}`;
      payload["MimeType"] = whatsappMimeType;
      payload["PTT"] = true;
      payload["FileName"] = originalName;
      
      if (durationFromFront) {
        payload["Seconds"] = parseInt(durationFromFront as string);
      } else {
        payload["Seconds"] = Math.max(1, Math.ceil(buffer.length / 16000));
      }
      
      console.log(`[${time}] 📤 VOICE NOTE PAYLOAD (PTT):`, {
        phone: payload.Phone,
        fileName: payload.FileName,
        ptt: payload.PTT,
        mimeType: payload.MimeType,
        format: formatType,
        seconds: payload["Seconds"]
      });
    } else {
      // ❌ WebM atau format lain - Kirim sebagai AUDIO DOCUMENT
      console.log(`[${time}] ⚠️ Format ${originalMime} tidak compatible dengan WhatsApp PTT`);
      console.log(`[${time}] 📤 Mengirim sebagai audio file (bukan voice note)`);
      
      // ✅ Kirim sebagai audio file yang bisa diplay
      payload["Document"] = `data:application/octet-stream;base64,${base64String}`;
      payload["Mimetype"] = originalMime;
      payload["FileName"] = originalName;
      
      endpoint = "document";
    }
  } else {
    // Audio file biasa (MP3/M4A yang di-upload manual)
    payload["Document"] = `data:application/octet-stream;base64,${base64String}`;
    payload["Mimetype"] = originalMime;
    payload["FileName"] = originalName;
    endpoint = "document";
  }
}
      else if (isVideo) {
        const simpleMime = originalMime.split(';')[0].trim();
        payload["Video"] = `data:${simpleMime};base64,${base64String}`;
        payload["Caption"] = captionFromFront || "";
        payload["FileName"] = originalName;
        
        if (durationFromFront) {
          payload["Seconds"] = parseInt(durationFromFront as string);
        }
        
        console.log(`[${time}] 📤 VIDEO PAYLOAD`);
      } 
      else {
        const fullBase64 = `data:application/octet-stream;base64,${base64String}`;
        payload["Document"] = fullBase64;
        payload["Mimetype"] = originalMime;
        payload["FileName"] = originalName;
        
        console.log(`[${time}] 📤 DOCUMENT PAYLOAD`);
      }

      console.log(`[${time}] 📤 SENDING TO: https://wuzapi.ibmpgroup.com/chat/send/${endpoint}`);
      console.log(`[${time}] 📤 PAYLOAD KEYS:`, Object.keys(payload)); // Debug

      const wuzapiRes = await fetch(`https://wuzapi.ibmpgroup.com/chat/send/${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'token': 'Indoboga@2026' 
        },
        body: JSON.stringify(payload),
      });

      const wuzapiData = await wuzapiRes.json();
      
      console.log(`[${time}] 📥 WUZAPI RESPONSE:`, {
        status: wuzapiRes.status,
        ok: wuzapiRes.ok,
        response: JSON.stringify(wuzapiData, null, 2)
      });

      if (wuzapiData.success || wuzapiData.Success) {
        whatsappId = wuzapiData.data?.Id || wuzapiData.id || wuzapiData.data?.id;
        isSuccessToWA = true;
        console.log(`[${time}] ✅ WUZAPI SUCCESS - ID: ${whatsappId}`);
      } else {
        wuzapiError = wuzapiData.error || wuzapiData.Error || wuzapiData.message || 'Unknown error';
        console.error(`[${time}] ❌ WUZAPI FAILED:`, wuzapiError);
      }
    } catch (err: any) {
      wuzapiError = err.message;
      console.error(`[${time}] ❌ WUZAPI ERROR:`, err.message);
    }

    // --- SIMPAN KE DATABASE ---
    const labelPesan = isImage 
      ? '[Gambar]' 
      : (isAudio ? '[Pesan Suara]' : (isVideo ? '[Video]' : `[Dokumen: ${originalName}]`));
    
    const finalMessageText = isSuccessToWA ? labelPesan : `${labelPesan} (Gagal Kirim ke WA)`;

    await query(
      `INSERT INTO crm_website.messages (customer_id, marketing_id, sender_type, message_text, image_url, id_whatsapp) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerId, marketingId, 'marketing', finalMessageText, fileUrl, whatsappId]
    );

    console.log(`[${time}] ✅ SAVED TO DATABASE`);

    return NextResponse.json({ 
      success: isSuccessToWA, 
      url: fileUrl, 
      id_whatsapp: whatsappId,
      error: wuzapiError,
      endpoint: `chat/send/${endpoint}`
    });

  } catch (error: any) {
    console.error(`[${getLogTime()}] ❌ POST ERROR:`, error.message);
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}