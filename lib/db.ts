import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  // Tambahkan timeout agar tidak loading selamanya jika DB mati
  connectionTimeoutMillis: 5000, 
});

export const query = async (text: string, params?: any[]) => {
  // Langsung gunakan pool.query untuk query tunggal
  // Ini otomatis menangani connect & release di belakang layar
  try {
    // Set search_path bisa digabung atau dilakukan lewat parameter pool
    await pool.query(`SET search_path TO ${process.env.DB_SCHEMA || 'crm_website'}, public`);
    return await pool.query(text, params);
  } catch (err: any) {
    console.error("❌ Database Error:", err.message);
    throw err;
  }
};