import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  endpoint: "http://minio.ibmpgroup.com:9000",
  region: "us-east-1",
  credentials: {
    // Menambahkan || "" agar jika env tidak terbaca, ia mengirim string kosong bukan undefined
    accessKeyId: (process.env.MINIO_ACCESS_KEY as string) || "", 
    secretAccessKey: (process.env.MINIO_SECRET_KEY as string) || "",
  },
  forcePathStyle: true,
});