import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { s3Client } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";

function getLogTime() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

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

// ====================================================================
// MAIN HANDLER - Return response CEPAT, proses di background
// ====================================================================
export async function POST(request: Request) {
  const time = getLogTime();
  
  try {
    const body = await request.json();
    console.log(`[${time}] 📥 WEBHOOK RECEIVED - Type: ${body.type}`);
    
    // Quick ignore
    if (body.type === 'ChatPresence') {
      console.log(`[${time}] ⏭️ Ignored: ChatPresence`);
      return NextResponse.json({ status: "ignored" });
    }
    
    if (body.type?.includes('Latency')) {
      console.log(`[${time}] ⏭️ Ignored: Latency event`);
      return NextResponse.json({ status: "ignored" });
    }

    // ✅ IDENTIFIKASI MESSAGE PENTING (harus diproses langsung)
    const event = body.event || {};
    const msgData = event.Message || {};
    
    const isPriorityMessage = (
      // Text message
      msgData.conversation ||
      msgData.extendedTextMessage?.text ||
      // Call events
      body.type?.includes('Call') ||
      event.CallID ||
      // Revoke
      msgData.protocolMessage
    );

    const hasMedia = !!(
      msgData.imageMessage ||
      msgData.documentMessage ||
      msgData.videoMessage ||
      msgData.audioMessage
    );

    // ⚡ PROSES LANGSUNG untuk text message & call (tanpa media besar)
    if (isPriorityMessage && (!hasMedia || body.type?.includes('Call'))) {
      console.log(`[${time}] ⚡ PROCESSING IMMEDIATELY (priority message)`);
      
      try {
        await processWebhookInBackground(body, time);
        return NextResponse.json({ 
          status: "processed",
          timestamp: new Date().toISOString()
        });
      } catch (err: any) {
        console.error(`[${time}] ❌ IMMEDIATE PROCESSING ERROR:`, err.message);
        // Fallback ke background jika gagal
        setImmediate(() => {
          processWebhookInBackground(body, time).catch(console.error);
        });
        return NextResponse.json({ 
          status: "accepted",
          note: "fallback to background"
        });
      }
    }

    // 🔄 BACKGROUND untuk media besar (image/video/document download)
    console.log(`[${time}] 🔄 PROCESSING IN BACKGROUND (media download)`);
    
    const response = NextResponse.json({ 
      status: "accepted",
      timestamp: new Date().toISOString()
    });

    setImmediate(() => {
      processWebhookInBackground(body, time).catch(err => {
        console.error(`[${time}] ❌ BACKGROUND ERROR:`, err.message);
      });
    });

    return response;

  } catch (error: any) {
    console.error(`[${time}] ❌ WEBHOOK PARSE ERROR:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ====================================================================
// BACKGROUND PROCESSOR - Semua logika berat di sini
// ====================================================================
async function processWebhookInBackground(body: any, initialTime: string) {
  const time = getLogTime();
  console.log(`[${time}] 🔄 BACKGROUND PROCESSING STARTED (received at ${initialTime})`);

  try {
    // DEBUG: Log full payload untuk call
    if (body.type?.includes('Call') && !body.type?.includes('Latency')) {
      console.log(`[${time}] 📋 FULL PAYLOAD:`, JSON.stringify(body, null, 2));
    }

    const event = body.event || {};
    const info = event.Info || {};
    const msgData = event.Message || {};
    
    const isFromMe = info.IsFromMe || event.IsFromMe || body.event?.IsFromMeta || false;
    const isCallEvent = (body.type?.includes('Call') || !!event.CallID) && !body.type?.includes('Latency');
    
    console.log(`[${time}] 🔍 Event Check - isCallEvent: ${isCallEvent}, Type: ${body.type}`);
    
    let pesanMasuk = msgData.conversation || msgData.extendedTextMessage?.text || 
                     msgData.imageMessage?.caption || 
                     msgData.documentMessage?.title || msgData.videoMessage?.caption || "";
    let whatsappId = info.ID || info.Id || event.CallID || body.call?.id;
    let callDuration = 0;
    let isAcceptedElsewhere = false;

    // === LOGIKA NOMOR ===
    let senderRaw = isFromMe 
        ? (info.Chat || event.Chat || event.To || "") 
        : (info.Sender || event.From || body.call?.from || "");
        
    let senderAltRaw = isFromMe ? "" : (info.SenderAlt || event.CallCreator || "");

    console.log(`[${time}] 🔍 BEFORE PROCESSING - Raw: "${senderRaw}", Alt: "${senderAltRaw}"`);

    let primaryNumber = "";
    let lidNumber = "";

    if (senderRaw) {
      if (senderRaw.includes('@lid')) {
        lidNumber = senderRaw;
      } else {
        primaryNumber = senderRaw;
      }
    }

    if (senderAltRaw) {
      if (senderAltRaw.includes('@lid')) {
        if (!lidNumber) lidNumber = senderAltRaw;
      } else {
        if (!primaryNumber) primaryNumber = senderAltRaw;
      }
    }

    if (!primaryNumber && lidNumber && isCallEvent) {
      const altSources = [
        event.Participant,
        event.participant,
        body.call?.participant,
        info.RemoteJid,
        info.Participant
      ].filter(Boolean);
      
      console.log(`[${time}] 🔎 Searching alternatives:`, altSources);
      
      for (const alt of altSources) {
        if (alt && !alt.includes('@lid')) {
          primaryNumber = alt;
          console.log(`[${time}] ✅ Found real number from alternatives: ${primaryNumber}`);
          break;
        }
      }
    }

    senderRaw = primaryNumber || lidNumber;
    senderAltRaw = lidNumber;

    console.log(`[${time}] ✅ AFTER PROCESSING - Primary: "${senderRaw}", LID: "${senderAltRaw}"`);

    // --- LOGIKA PANGGILAN ---
    if (isCallEvent) {
      console.log(`[${time}] 📞 CALL EVENT - Type: ${body.type}, CallID: ${event.CallID}`);

      const callStatus = body.type;
      const reason = event.Reason || event.Data?.Attrs?.reason || "";
      callDuration = body.call?.duration || event.Duration || 0;

      console.log(`[${time}] 📊 Status: ${callStatus}, Reason: ${reason}, Duration: ${callDuration}`);

      const statusPenting = ['CallTerminate', 'CallAccept', 'CallOffer', 'CallMissed'];
      if (!statusPenting.includes(callStatus)) {
        console.log(`[${time}] ⏭️ Ignored: ${callStatus}`);
        return;
      }

      const arah = isFromMe ? "Keluar" : "Masuk";
      isAcceptedElsewhere = (reason === 'accepted_elsewhere' && callStatus === 'CallTerminate');
      
      if (callStatus === 'CallOffer') {
        pesanMasuk = `📞 Panggilan ${arah}: Memanggil...`;
      } else if (callStatus === 'CallAccept') {
        pesanMasuk = `📞 Panggilan ${arah}: Tersambung`;
      } else if (callStatus === 'CallTerminate') {
        pesanMasuk = `📞 Panggilan ${arah}: Diproses...`;
      } else if (callStatus === 'CallMissed') {
        pesanMasuk = `📞 Panggilan ${arah}: Tidak Terjawab`;
      }
      
      whatsappId = event.CallID || body.call?.id || `CALL_${Date.now()}`;
      console.log(`[${time}] 📝 Label: ${pesanMasuk}`);
    }

    // --- LOGIKA REVOKE ---
    const protocolMsg = msgData.protocolMessage;
    if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE')) {
      const revokedId = protocolMsg.key?.id || protocolMsg.Key?.Id;
      if (revokedId) {
        await query(`DELETE FROM crm_website.messages WHERE id_whatsapp = $1`, [revokedId]);
        console.log(`[${time}] 🗑️ Message revoked: ${revokedId}`);
        return;
      }
    }

    // --- LOGIKA MEDIA dengan TIMEOUT & SIZE LIMIT ---
    const mediaObject = msgData.imageMessage || msgData.documentMessage || 
                        msgData.videoMessage || msgData.audioMessage;
    let fileUrl = null;

    if (mediaObject) {
      try {
        const fileSize = Number(mediaObject.fileLength || 0);
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit
        
        if (fileSize > MAX_SIZE) {
          console.log(`[${time}] ⚠️ File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB - Skipped`);
          pesanMasuk = pesanMasuk || "[File terlalu besar - tidak diunduh]";
        } else {
          const isDoc = !!msgData.documentMessage;
          const isAudio = !!msgData.audioMessage;
          const isVideo = !!msgData.videoMessage;
          const isImage = !!msgData.imageMessage;
          
          let endpoint = 'downloadimage';
          if (isDoc) endpoint = 'downloaddocument';
          else if (isAudio) endpoint = 'downloadaudio';
          else if (isVideo) endpoint = 'downloadvideo';
          
          console.log(`[${time}] 📥 DOWNLOADING MEDIA - Type: ${endpoint}, Size: ${(fileSize / 1024).toFixed(2)}KB`);
          
          // ⏱️ TIMEOUT PROTECTION (25 seconds)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          
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
                "FileLength": fileSize
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const downloadData = await resDownload.json();
            console.log(`[${time}] 📥 DOWNLOAD RESPONSE:`, {
              success: downloadData.success,
              hasData: !!downloadData.data
            });
            
            const base64Raw = downloadData.data?.Data || downloadData.data || downloadData.Data;

            if (downloadData.success && base64Raw) {
              const ext = getFileExtension(mediaObject.mimetype || "");
              const safeFileName = `${Date.now()}_file.${ext}`;
              const cleanBase64 = base64Raw.includes('base64,') ? base64Raw.split('base64,').pop() : base64Raw;
              
              // ⏱️ S3 Upload dengan timeout
              const uploadController = new AbortController();
              const uploadTimeout = setTimeout(() => uploadController.abort(), 20000);
              
              await s3Client.send(new PutObjectCommand({
                Bucket: "crmweb", 
                Key: safeFileName, 
                Body: Buffer.from(cleanBase64, 'base64'),
                ContentType: mediaObject.mimetype || 'application/octet-stream',
              }), { abortSignal: uploadController.signal });
              
              clearTimeout(uploadTimeout);
              
              fileUrl = safeFileName;
              console.log(`[${time}] ✅ MEDIA SAVED TO S3: ${safeFileName}`);
              
              if (!pesanMasuk) {
                if (isAudio) pesanMasuk = "[Pesan Suara]";
                else if (isVideo) pesanMasuk = "[Video]";
                else if (isDoc) pesanMasuk = "[Dokumen]";
                else pesanMasuk = "[Gambar]";
              }
            } else {
              console.error(`[${time}] ❌ MEDIA DOWNLOAD FAILED:`, downloadData);
              pesanMasuk = pesanMasuk || "[Gagal mengunduh media]";
            }
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            if (fetchErr.name === 'AbortError') {
              console.error(`[${time}] ⏱️ DOWNLOAD TIMEOUT after 25s`);
              pesanMasuk = pesanMasuk || "[Timeout saat mengunduh media]";
            } else {
              throw fetchErr;
            }
          }
        }
      } catch (err: any) { 
        console.error(`[${time}] ❌ MEDIA ERROR:`, err.message); 
        pesanMasuk = pesanMasuk || "[Error saat memproses media]";
      }
    }

    // --- SIMPAN KE DATABASE ---
    const sender = senderRaw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const senderAlt = senderAltRaw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const pushName = info.PushName || (isCallEvent ? "WhatsApp Caller" : "Customer");
    const targetMarketingId = 2;

    console.log(`[${time}] 👤 FINAL - Sender: ${sender}, Alt: ${senderAlt}`);

    if (sender && (pesanMasuk || whatsappId)) {
      try {
        const isLid = (num: string) => num.length > 13 && !num.startsWith('62');

        let customerId;
        
        if (isCallEvent) {
          const existingCall = await query(
            `SELECT customer_id FROM crm_website.messages WHERE id_whatsapp = $1 LIMIT 1`,
            [whatsappId]
          );
          
          if (existingCall.rows.length > 0) {
            customerId = existingCall.rows[0].customer_id;
            console.log(`[${time}] ✅ Customer dari CallID: ${customerId}`);
          }
        }
        
        if (!customerId) {
          const checkCust = await query(
            `SELECT id, phone_number, whatsapp_lid FROM crm_website.customers 
              WHERE phone_number = $1 OR whatsapp_lid = $1 OR phone_number = $2 OR whatsapp_lid = $2
              LIMIT 1`, [sender, senderAlt]
          );

          if (checkCust.rows.length > 0) {
            const found = checkCust.rows[0];
            customerId = found.id;
            console.log(`[${time}] ✅ Customer found: ID ${customerId}`);

            const currentLid = isLid(sender) ? sender : (isLid(senderAlt) ? senderAlt : null);
            if (currentLid && !found.whatsapp_lid) {
              await query(
                `UPDATE crm_website.customers SET whatsapp_lid = $1, marketing_id = $2 WHERE id = $3`,
                [currentLid, targetMarketingId, customerId]
              );
              console.log(`[${time}] 🔄 LID synced: ${currentLid}`);
            } else {
              await query(`UPDATE crm_website.customers SET last_interaction = NOW(), marketing_id = $1 WHERE id = $2`, [targetMarketingId, customerId]);
            }
          } else {
            const finalPhone = isLid(sender) ? (senderAlt || sender) : sender;
            const finalLid = isLid(sender) ? sender : (isLid(senderAlt) ? senderAlt : null);
            const insertRes = await query(
              `INSERT INTO crm_website.customers (phone_number, whatsapp_lid, full_name, source, marketing_id)
                VALUES ($1, $2, $3, 'WhatsApp', $4) RETURNING id`,
              [finalPhone, finalLid, pushName, targetMarketingId]
            );
            customerId = insertRes.rows[0].id;
            console.log(`[${time}] ➕ New customer created: ID ${customerId}`);
          }
        }

        const senderType = isFromMe ? 'marketing' : 'customer';
        
        if (isCallEvent) {
          const arah = isFromMe ? "Keluar" : "Masuk";
          const callStatus = body.type;
          
          const existingMsg = await query(
            `SELECT id, call_started_at, message_text FROM crm_website.messages 
             WHERE id_whatsapp = $1 LIMIT 1 FOR UPDATE`, 
            [whatsappId]
          );

          if (existingMsg.rows.length > 0) {
            const msgFound = existingMsg.rows[0];
            console.log(`[${time}] 🔄 Existing call: ID ${msgFound.id}, Status: ${callStatus}`);
            
            if (callStatus === 'CallAccept') {
              const alreadyTerminated = msgFound.message_text?.includes('Selesai');
              
              if (!alreadyTerminated) {
                await query(
                  `UPDATE crm_website.messages 
                   SET message_text = $1, call_started_at = NOW() 
                   WHERE id = $2`,
                  [`📞 Panggilan ${arah}: Tersambung`, msgFound.id]
                );
                console.log(`[${time}] ✅ Call accepted & timer started`);
              } else {
                console.log(`[${time}] ⏭️ Call already terminated`);
              }
            } 
            else if (callStatus === 'CallTerminate' || isAcceptedElsewhere) {
              if (isAcceptedElsewhere) {
                console.log(`[${time}] ⏭️ Skipped: accepted_elsewhere (panggilan aktif di WA Marketing)`);
                
                if (!msgFound.call_started_at) {
                  await query(
                    `UPDATE crm_website.messages SET call_started_at = NOW() WHERE id = $1`,
                    [msgFound.id]
                  );
                }
                return;
              }
              
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const updatedMsg = await query(
                `SELECT call_started_at FROM crm_website.messages WHERE id = $1`,
                [msgFound.id]
              );
              
              const callStarted = updatedMsg.rows[0]?.call_started_at;
              let finalText;
              let calculatedDuration = 0;

              if (callDuration > 0) {
                calculatedDuration = callDuration;
                console.log(`[${time}] ⏱️ Duration dari payload: ${calculatedDuration}s`);
              } 
              else if (callStarted) {
                const startTime = new Date(callStarted).getTime();
                const endTime = Date.now();
                calculatedDuration = Math.floor((endTime - startTime) / 1000);
                console.log(`[${time}] ⏱️ Duration dihitung: ${calculatedDuration}s`);
              }

              if (calculatedDuration > 0) {
                const mins = Math.floor(calculatedDuration / 60);
                const secs = calculatedDuration % 60;
                finalText = `📞 Panggilan ${arah}: Selesai (${mins}:${secs.toString().padStart(2, '0')})`;
              } else {
                finalText = `📞 Panggilan ${arah}: Tidak Terjawab`;
              }

              await query(
                `UPDATE crm_website.messages 
                 SET message_text = $1, call_duration = $2 
                 WHERE id = $3`,
                [finalText, calculatedDuration, msgFound.id]
              );
              
              console.log(`[${time}] ✅ Call ended - Duration: ${calculatedDuration}s`);
            }
            else if (callStatus === 'CallMissed') {
              await query(
                `UPDATE crm_website.messages 
                 SET message_text = $1 
                 WHERE id = $2`,
                [`📞 Panggilan ${arah}: Tidak Terjawab`, msgFound.id]
              );
              console.log(`[${time}] ⚠️ Call missed`);
            }
          } else {
            console.log(`[${time}] ➕ Inserting new call message`);
            await query(
              `INSERT INTO crm_website.messages 
               (customer_id, sender_type, message_text, image_url, id_whatsapp, marketing_id, call_duration) 
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [customerId, senderType, pesanMasuk, fileUrl, whatsappId, targetMarketingId, 0]
            );
          }
        } else {
          console.log(`[${time}] ➕ Inserting regular message`);
          await query(
            `INSERT INTO crm_website.messages 
             (customer_id, sender_type, message_text, image_url, id_whatsapp, marketing_id) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [customerId, senderType, pesanMasuk, fileUrl, whatsappId, targetMarketingId]
          );
        }
        
        console.log(`[${time}] ✅ BACKGROUND PROCESSING COMPLETED`);
      } catch (dbErr: any) { 
        console.error(`[${time}] ❌ DB ERROR:`, dbErr.message);
      }
    } else {
      console.log(`[${time}] ⏭️ Skipped - No sender/message`);
    }

  } catch (error: any) {
    console.error(`[${time}] ❌ BACKGROUND PROCESSING ERROR:`, error.message);
  }
}