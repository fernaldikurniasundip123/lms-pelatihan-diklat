export interface BahanDiklatItem {
  id: string;
  course_id: string;
  course_name: string;
  category: string;
  pertemuan: string; // e.g. "Pertemuan 1", "Part 1"
  file_name: string;
  file_url: string; // Supabase storage URL or Data URL
  file_data?: string; // Optional base64 data fallback
  created_at: string;
}

export interface BahanDiklatAccessLog {
  id: string;
  nama: string;
  data_akses: "Peserta Diklat STIP" | "Dosen" | "Institusi";
  nama_institusi?: string;
  course_name: string;
  pertemuan: string;
  accessed_at: string;
}
