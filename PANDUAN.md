# Panduan Aplikasi Android Skrining Gizi MST–GLIM

Lakukan langkah ini sekali saja, sebaiknya di laptop. Semua layanan yang dipakai gratis.

## Bagian A — Siapkan database (Firebase)

1. Buka https://console.firebase.google.com dan masuk dengan akun Google.
2. Klik **Create a project** (Buat proyek). Beri nama, misalnya `skrining-gizi-rs`. Google Analytics boleh dimatikan.
3. Menu kiri **Build → Authentication → Get started**. Pada tab **Sign-in method**, pilih **Email/Password**, aktifkan (Enable), lalu **Save**.
4. Menu kiri **Build → Firestore Database → Create database**.
   - Lokasi: pilih **asia-southeast2 (Jakarta)**.
   - Mode: pilih **production mode**.
5. Masih di Firestore, buka tab **Rules**. Hapus semua isinya, tempel seluruh isi file `firestore.rules` dari folder ini, lalu klik **Publish**.
6. Klik ikon ⚙ (di samping *Project Overview*) → **Project settings**. Di bagian **Your apps**, klik ikon **</>** (Web). Beri nama `skrining-web`, lalu klik **Register app**.
7. Akan muncul kode berisi `const firebaseConfig = { apiKey: ..., ... }`. Salin 6 baris isinya (apiKey sampai appId).

## Bagian B — Masukkan konfigurasi

Buka file `src/firebase-config.js`, lalu ganti tulisan `ISI_...` dengan nilai yang Anda salin dari Firebase. Simpan.

Bisa juga kirim isi konfigurasi itu ke Claude, nanti Claude yang mengisikan. Konfigurasi ini memang bukan rahasia; keamanan data diatur oleh aturan di langkah A5.

## Bagian C — Rakit APK otomatis (GitHub)

1. Buat akun di https://github.com (gratis).
2. Klik **+** (kanan atas) → **New repository**. Nama: `skrining-gizi`. Pilih **Public** agar tautan APK bisa dibuka rekan tanpa akun GitHub. Data pasien tidak ikut tersimpan di sini. Klik **Create repository**.
3. Klik tautan **uploading an existing file**. Seret **semua isi** folder `skrining-gizi-android` ke halaman itu, lalu klik **Commit changes**.
4. Periksa apakah folder `.github` ikut terunggah. Folder ini sering tidak ikut karena namanya diawali titik. Jika tidak ada:
   - Klik **Add file → Create new file**.
   - Ketik nama `.github/workflows/build-apk.yml`.
   - Tempel isi file `build-apk.yml` dari folder `.github/workflows`, lalu klik **Commit changes**.
5. Buka tab **Actions**. Proses **Rakit APK** berjalan sekitar 5–8 menit. Tanda ✅ hijau berarti selesai.
6. Buka halaman utama repository → bagian **Releases** (kolom kanan) → unduh **SkriningGizi.apk**.

Setiap kali ada perubahan file di GitHub, APK baru otomatis dirakit dengan nomor versi berikutnya.

## Bagian D — Pasang di HP

1. Kirim file **SkriningGizi.apk** ke HP, misalnya lewat WhatsApp atau Google Drive, atau bagikan tautan halaman Releases.
2. Buka file tersebut. Jika muncul peringatan, izinkan **Instal dari sumber ini / Install unknown apps**, lalu **Install**.
3. Jika Play Protect bertanya, pilih **Tetap instal**. Ini wajar untuk aplikasi yang tidak berasal dari Play Store.

## Bagian E — Mulai dipakai

1. **Admin (Anda) mendaftar paling awal.** Buka aplikasi → **Daftar akun baru**. Akun pertama otomatis menjadi admin.
2. Petugas memasang APK yang sama lalu menekan **Daftar akun baru**. Akun mereka berstatus *menunggu*.
3. Admin membuka menu **Akun → Kelola petugas**, memilih peran (Nakes/Petugas), lalu menekan **Setujui**.
4. Semua petugas yang sudah disetujui melihat data pasien yang sama secara langsung. Saat tidak ada sinyal, data tetap bisa disimpan dan otomatis terkirim begitu HP online.

## Hak akses

| Peran | Hak akses |
|---|---|
| Admin | Semua fitur, kelola petugas, ubah dan hapus semua data |
| Nakes | Input skrining, lihat semua data, ubah dan hapus data sendiri |
| Petugas | Input skrining, lihat semua data, ubah data sendiri |

## Catatan

- Paket gratis Firebase (Spark) cukup untuk pemakaian satu unit atau ruangan. Jika data sudah ribuan dan petugas banyak, pantau pemakaian di menu **Usage** Firestore.
- Nonaktifkan akun petugas yang sudah tidak bertugas lewat menu Akun.
- Untuk mengekspor data ke Excel: menu **Data pasien → Unduh CSV**.
- Aplikasi ini alat bantu skrining, bukan pengganti rekam medis resmi. Patuhi kebijakan privasi data pasien di rumah sakit Anda.
