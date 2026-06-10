# DriveSafe — ESP32 MPU6050 Web Server

Capstone Project 2026 — B06

Sistem monitoring kendaraan berbasis **ESP32** dan sensor **MPU6050** dengan antarmuka web real-time. Aplikasi ini mendeteksi insiden (kecelakaan/kecelakaan potensial), menampilkan orientasi kendaraan dalam 3D, dan menyediakan mode darurat beserta replay rekaman insiden.

## Ringkasan Fitur

### Monitoring Real-Time
- Data **gyroscope**, **accelerometer**, dan **suhu** MPU6050 via Server-Sent Events (SSE)
- Visualisasi **3D kendaraan** (Sepeda, Motor, Mobil) dengan orientasi mengikuti sensor
- Tombol reset orientasi (full / per sumbu X, Y, Z)

### Deteksi Insiden
Sistem memicu alert ketika salah satu kondisi berikut terpenuhi:

| Jenis Deteksi | Parameter | Threshold | Pesan Alert |
|---|---|---|---|
| Shock / Akselerasi Drastis | `accX` dan `accY` | > 12 m/s² (keduanya) | Perubahan percepatan drastis kendaraan terdeteksi! |
| Roll Angle | Sudut roll (sumbu X) | ≥ 60° | Orientasi kendaraan Roll Angle terdeteksi! |
| Pitch Angle | Sudut pitch (sumbu Y) | ≥ 90° | Orientasi kendaraan Pitch Angle terdeteksi! |
| Overturn / Rollover | Roll dan pitch | ≥ 60° (keduanya) | Orientasi kendaraan Overturn/Rollover terdeteksi! |

### Alur Emergency
1. **Vehicle Accident Detected!** — popup muncul dengan pesan sesuai jenis deteksi
2. **Countdown 15 detik** sebelum emergency mode aktif
3. Tombol **Batalkan** untuk membatalkan alert
4. Jika tidak dibatalkan, masuk **Emergency Mode**:
   - Layar berkedip merah transparan
   - Teks: *Emergency Alert! Vehicle Accident Detected*
   - Opsi aksi:
     - Hubungi kontak tersimpan *(placeholder)*
     - Petakan rumah sakit terdekat *(placeholder)*
     - Putar ulang rekaman insiden
     - Reset Emergency

### Replay Insiden
- Rekaman mencakup **5 detik sebelum** insiden terdeteksi dan **3 detik setelah** insiden terdeteksi
- Playback disinkronkan dengan **timestamp asli** antar sampel sensor
- Saat replay, tampilan kembali ke interface utama (kartu sensor + 3D kendaraan)
- Overlay dashboard replay menampilkan:
  - Badge **REC** (berkedip saat pemutaran)
  - **Progress bar**
  - **Timestamp relatif** (`t = -5.00s` … `t = +3.00s`, acuan `t=0` = momen deteksi)
  - Ringkasan akselerasi dan orientasi (roll/pitch)
- Pergerakan kendaraan 3D ikut diputar ulang dari data log

## Struktur Proyek

```
esp32-mpu6050-web-server/
├── data/                  # File web (di-upload ke LittleFS)
│   ├── index.html         # Halaman utama + modal emergency & replay
│   ├── style.css          # Styling UI
│   └── script.js          # Logika deteksi, 3D, emergency, replay
├── include/
│   └── wifi_credentials.h.example
├── src/
│   └── main.cpp           # Firmware ESP32, sensor, web server
└── platformio.ini
```

## Persiapan & Instalasi

### Kebutuhan
- Board **ESP32**
- Sensor **MPU6050** (I2C: SDA GPIO 21, SCL GPIO 22)
- [PlatformIO](https://platformio.org/)

### Konfigurasi WiFi
Salin file kredensial WiFi:

```bash
cp include/wifi_credentials.h.example include/wifi_credentials.h
```

Edit `include/wifi_credentials.h` dan isi SSID serta password jaringan Anda.

### Build & Upload

```bash
# Upload firmware
pio run -t upload

# Upload file web ke LittleFS
pio run -t uploadfs
```

Buka Serial Monitor (115200 baud) untuk melihat alamat IP ESP32 setelah terhubung ke WiFi. Akses antarmuka web melalui browser di IP tersebut.

## Parameter yang Dapat Disesuaikan

File `data/script.js`:

| Konstanta | Nilai Default | Keterangan |
|---|---|---|
| `SHOCK_THRESHOLD` | 12 | Threshold akselerasi (m/s²) |
| `SHOCK_COUNTDOWN_START` | 15 | Detik countdown sebelum emergency |
| `ROLL_ALERT_DEG` | 60 | Threshold roll (derajat) |
| `PITCH_ALERT_DEG` | 90 | Threshold pitch (derajat) |
| `ROLLOVER_ALERT_DEG` | 60 | Threshold rollover (derajat) |
| `INCIDENT_PREBUFFER_MS` | 5000 | Durasi log sebelum insiden (ms) |
| `INCIDENT_POSTBUFFER_MS` | 3000 | Durasi log setelah insiden (ms) |

## Catatan Teknis

- Deteksi orientasi dihitung dari nilai gyro terintegrasi (rad → derajat) di sisi frontend.
- Log sensor disimpan di memori browser (`sensorHistory`) dengan retensi hingga 120 detik.
- Replay baru dapat diputar setelah periode post-buffer (3 detik) selesai direkam.
- Fitur hubungi kontak dan peta rumah sakit masih placeholder — siap diintegrasikan pada tahap berikutnya.

## Lisensi & Referensi

Proyek ini berdasarkan tutorial [ESP32 MPU6050 Web Server](https://RandomNerdTutorials.com/esp32-mpu-6050-web-server/) oleh Rui Santos, dikembangkan lebih lanjut untuk kebutuhan capstone DriveSafe.
