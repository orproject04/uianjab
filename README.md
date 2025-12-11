# PANDAWA - Portal Anjab dan ABK Berbasis Web Terintegrasi

**PANDAWA** adalah sistem manajemen analisis jabatan (Anjab) dan analisis beban kerja (ABK) berbasis web yang terintegrasi. Dibangun dengan teknologi modern untuk memudahkan pengelolaan dokumen Anjab, struktur organisasi, dan perhitungan kebutuhan pegawai.

![PANDAWA Dashboard](./banner.png)

Platform ini memanfaatkan **Next.js 15**, **React 19**, dan **TypeScript** untuk memberikan pengalaman pengguna yang cepat dan responsif, dengan database **PostgreSQL** yang robust untuk pengelolaan data yang kompleks.

## 🎯 Fitur Utama

### 📋 Manajemen Analisis Jabatan
- **Master Anjab**: Kelola dokumen analisis jabatan lengkap
- **Upload Word Document**: Import dokumen Anjab dari file .doc/.docx
- **Export to Word/PDF**: Generate dokumen Anjab dalam format Word dan PDF
- **Auto-matching**: Pencocokan otomatis antara peta jabatan dan master Anjab menggunakan fuzzy matching
- **Similarity Score**: Perhitungan tingkat kecocokan dengan algoritme Levenshtein

### 🏢 Peta Jabatan (Struktur Organisasi)
- **Hierarchical Structure**: Visualisasi struktur organisasi multi-level
- **Drag & Drop**: Reorganisasi struktur dengan mudah
- **Jenis Jabatan**: Kategorisasi (JPT, Administrator, Pengawas, Pelaksana, Fungsional)
- **Bezetting vs Kebutuhan**: Perbandingan jumlah pegawai saat ini vs kebutuhan

### 📊 Analisis Beban Kerja (ABK)
- **Tugas Pokok**: Mapping tugas pokok dari master Anjab ke peta jabatan
- **Perhitungan Otomatis**: Kalkulasi kebutuhan pegawai berdasarkan beban kerja
- **Custom Values**: Override nilai default untuk setiap tugas
- **Real-time Updates**: Update otomatis kebutuhan pegawai

### 🔐 Autentikasi & Otorisasi
- **Role-based Access**: Admin, Editor, User
- **Email Verification**: Verifikasi email pengguna
- **Password Reset**: Recovery password via email
- **Session Management**: JWT dengan refresh token

### 📱 Mobile Responsive
- **Full Responsive**: Optimized untuk desktop, tablet, dan mobile
- **Touch-friendly**: Interface yang mudah digunakan di perangkat sentuh
- **Adaptive Layout**: Layout menyesuaikan ukuran layar

## 🛠️ Tech Stack

### Frontend
- **Next.js 15.1.5** - React framework dengan App Router
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Utility-first CSS framework
- **SweetAlert2** - Beautiful alerts & modals
- **ApexCharts** - Data visualization

### Backend
- **Next.js API Routes** - RESTful API
- **PostgreSQL** - Primary database
- **pg (node-postgres)** - PostgreSQL client
- **bcrypt** - Password hashing
- **jsonwebtoken** - JWT authentication
- **nodemailer** - Email sending

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Unit testing
- **TypeScript** - Type checking

## 📋 Prerequisites

Pastikan sistem Anda memiliki:

- **Node.js** 20.x atau lebih baru
- **PostgreSQL** 14.x atau lebih baru
- **npm** atau **yarn**

## 🚀 Installation

### 1. Clone Repository

```bash
git clone https://github.com/orproject04/uianjab.git
cd uianjab
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

#### Buat Database PostgreSQL

```bash
createdb pandawa_db
```

#### Jalankan Schema & Initial Data

```bash
psql -U postgres -d pandawa_db -f 01-schema.sql
psql -U postgres -d pandawa_db -f 02-initial-data.sql
```

### 4. Environment Variables

Buat file `.env.local` di root project:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/pandawa_db

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# Email Configuration (for verification & password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=PANDAWA <noreply@pandawa.local>

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

## 📁 Project Structure

```
uianjab/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (admin)/           # Admin layout pages
│   │   │   ├── (others-pages)/
│   │   │   │   ├── anjab/     # Anjab management pages
│   │   │   │   └── peta-jabatan/ # Org structure pages
│   │   │   └── page.tsx       # Dashboard
│   │   ├── (full-width-pages)/ # Auth & error pages
│   │   ├── api/               # API routes
│   │   │   ├── anjab/         # Anjab APIs
│   │   │   ├── peta-jabatan/  # Peta jabatan APIs
│   │   │   ├── auth/          # Authentication APIs
│   │   │   └── abk/           # ABK APIs
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── auth/              # Auth forms
│   │   ├── form/              # Form components
│   │   ├── tables/            # Table components
│   │   └── ui/                # UI components
│   ├── context/               # React contexts
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Utilities
│   │   ├── db.ts              # Database connection
│   │   ├── auth.ts            # Auth helpers
│   │   ├── search.ts          # Search/matching logic
│   │   └── anjab-queries.ts   # Database queries
│   └── layout/                # Layout components
├── scripts/                   # Python extraction scripts
│   ├── ekstrakanjab.py        # Extract Anjab from Word
│   └── ekstrakabk.py          # Extract ABK from Word
├── storage/
│   └── pdf-cache/             # Generated PDF cache
├── 01-schema.sql              # Database schema
├── 02-initial-data.sql        # Initial data
└── 03-backup-restore-guide.sql # Backup guide
```

## 🔑 Default Credentials

Setelah menjalankan `02-initial-data.sql`, login dengan:

- **Email**: `admin@pandawa.local`
- **Password**: `password123`

⚠️ **Penting**: Ganti password default setelah login pertama kali!

## 🐳 Docker Deployment

### Build & Run

```bash
docker-compose up -d
```

### Stop

```bash
docker-compose down
```

Database akan persist di volume Docker.

## 📖 Dokumentasi API

### Authentication

#### POST `/api/auth/login`
Login pengguna

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

### Anjab Management

#### GET `/api/anjab/list`
Mendapatkan daftar semua dokumen Anjab

#### GET `/api/anjab/detail?id={uuid}`
Detail dokumen Anjab tertentu

#### POST `/api/anjab/update`
Update dokumen Anjab

#### POST `/api/upload-json/route`
Upload dokumen Word dan convert ke Anjab

### Peta Jabatan

#### GET `/api/peta-jabatan`
Mendapatkan struktur organisasi lengkap

#### POST `/api/peta-jabatan`
Tambah jabatan baru

#### PATCH `/api/peta-jabatan/[id]`
Update jabatan

## 🧪 Testing

### Run Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

## 📝 Scripts Tambahan

### Extract Anjab dari Word

```bash
python scripts/ekstrakanjab.py input.doc output.json
```

### Extract ABK dari Word

```bash
python scripts/ekstrakabk.py input.doc output.json
```

## 🤝 Contributing

Kontribusi selalu diterima! Silakan:

1. Fork repository
2. Buat branch fitur (`git checkout -b feature/AmazingFeature`)
3. Commit perubahan (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 📄 License

Project ini dilisensikan di bawah MIT License.

## 🙏 Acknowledgments

- Template dashboard dari [TailAdmin](https://tailadmin.com)
- Icon dari [Heroicons](https://heroicons.com)
- Fuzzy matching menggunakan Levenshtein distance algorithm

## 📞 Support

Jika menemukan bug atau memiliki saran, silakan buat [issue](https://github.com/orproject04/uianjab/issues).

---

**Built with ❤️ for efficient workforce planning**
