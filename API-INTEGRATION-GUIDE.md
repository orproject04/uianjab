# 📘 Panduan Integrasi API - Aplikasi Anjab

Guide lengkap untuk mengintegrasikan aplikasi eksternal (mobile app, desktop app, atau sistem lain) dengan API Anjab.

---

## 🔐 Sistem Autentikasi

API ini menggunakan **Dual Authentication System**:
1. **HTTP-only Cookies** (untuk Web Browser - lebih aman)
2. **Bearer Token** (untuk Aplikasi Eksternal)

---

## 🌐 Base URL

```
Development: http://localhost:3000
Production:  https://your-domain.com
```

---

## 📋 Daftar Endpoint

### Autentikasi
- `POST /api/auth/login` - Login & dapatkan token
- `POST /api/auth/refresh` - Refresh token yang expired
- `GET /api/auth/me` - Dapatkan info user saat ini
- `POST /api/auth/logout` - Logout & hapus session

### Data Anjab
- `GET /api/peta-jabatan` - Dapatkan data peta jabatan
- `POST /api/peta-jabatan` - Buat node jabatan baru (admin)
- `PUT /api/peta-jabatan` - Update node jabatan (admin)
- `DELETE /api/peta-jabatan` - Hapus node jabatan (admin)

---

## 🔑 1. LOGIN

### A. Untuk Web Browser (Menggunakan Cookies)

#### Request:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

#### Request dengan JavaScript (Fetch API):
```javascript
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // PENTING! Agar cookies terkirim/tersimpan
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'password123'
  })
});

const result = await response.json();
console.log(result);
// Browser otomatis simpan cookies access_token & refresh_token
// Tidak perlu manual simpan token!
```

#### Response:
```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/; Max-Age=3600; SameSite=lax
Set-Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/; Max-Age=2592000; SameSite=lax

{
  "ok": true,
  "message": "Login berhasil",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImZ1bGxfbmFtZSI6IkFkbWluIFVzZXIiLCJpYXQiOjE3MzU4MjQwMDAsImV4cCI6MTczNTgyNzYwMH0.abc123...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNzM1ODI0MDAwLCJleHAiOjE3MzgzMzIwMDB9.xyz789...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Catatan untuk Browser:**
- ✅ Tokens di body **opsional** (bisa diabaikan untuk web browser)
- ✅ Browser akan otomatis simpan & kirim cookies
- ✅ Tidak perlu manual handle token di JavaScript
- 🔒 Cookies tidak bisa dibaca via `document.cookie` (lebih aman)

---

### B. Untuk Aplikasi Eksternal (Mobile/Desktop/API)

#### Request:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

#### Response:
```json
{
  "ok": true,
  "message": "Login berhasil",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImZ1bGxfbmFtZSI6IkFkbWluIFVzZXIiLCJpYXQiOjE3MzU4MjQwMDAsImV4cCI6MTczNTgyNzYwMH0.abc123...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNzM1ODI0MDAwLCJleHAiOjE3MzgzMzIwMDB9.xyz789...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Response Fields:**
- `access_token` - Token untuk akses API (expire 60 menit)
- `refresh_token` - Token untuk refresh access token (expire 30 hari)
- `token_type` - Tipe token (selalu "Bearer")
- `expires_in` - Durasi access token dalam detik (3600 = 1 jam)

**Aplikasi eksternal WAJIB simpan tokens** (di memory, secure storage, keychain, dll).

#### Contoh dengan cURL:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

#### Contoh dengan Python (requests):
```python
import requests

# Login
response = requests.post('http://localhost:3000/api/auth/login', json={
    'email': 'admin@example.com',
    'password': 'password123'
})

data = response.json()
access_token = data['access_token']
refresh_token = data['refresh_token']

# Simpan tokens (misalnya di variabel atau file config)
print(f"Access Token: {access_token}")
print(f"Refresh Token: {refresh_token}")
```

#### Contoh dengan JavaScript (Node.js):
```javascript
const fetch = require('node-fetch');

async function login() {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'password123'
    })
  });
  
  const data = await response.json();
  
  // Simpan tokens
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  
  return { accessToken, refreshToken };
}

login().then(tokens => {
  console.log('Logged in successfully');
  console.log('Access Token:', tokens.accessToken);
});
```

#### Contoh dengan Java (OkHttp):
```java
import okhttp3.*;
import org.json.JSONObject;

public class ApiClient {
    private static final String BASE_URL = "http://localhost:3000";
    private final OkHttpClient client = new OkHttpClient();
    
    public TokenResponse login(String email, String password) throws Exception {
        JSONObject json = new JSONObject();
        json.put("email", email);
        json.put("password", password);
        
        RequestBody body = RequestBody.create(
            json.toString(), 
            MediaType.parse("application/json")
        );
        
        Request request = new Request.Builder()
            .url(BASE_URL + "/api/auth/login")
            .post(body)
            .build();
        
        Response response = client.newCall(request).execute();
        JSONObject result = new JSONObject(response.body().string());
        
        return new TokenResponse(
            result.getString("access_token"),
            result.getString("refresh_token")
        );
    }
}
```

---

## 📊 2. GET DATA - /api/peta-jabatan

### A. Untuk Web Browser (Menggunakan Cookies)

#### Request:
```http
GET /api/peta-jabatan
```

**TIDAK PERLU kirim Authorization header** karena browser otomatis kirim cookies!

#### Request dengan JavaScript:
```javascript
const response = await fetch('http://localhost:3000/api/peta-jabatan', {
  credentials: 'include' // Browser otomatis kirim cookies
});

const data = await response.json();
console.log(data);
```

#### Response:
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid-123",
      "parent_id": null,
      "nama_jabatan": "Sekretaris Jenderal",
      "slug": "sekretaris-jenderal",
      "unit_kerja": "Sekretariat Jenderal",
      "level": 0,
      "bezetting": 1,
      "kebutuhan_pegawai": 1,
      "is_pusat": true,
      "jenis_jabatan": "Struktural",
      "kelas_jabatan": "Eselon I",
      "nama_pejabat": ["Dr. John Doe"],
      "jabatan_id": "uuid-456"
    }
  ]
}
```

---

### B. Untuk Aplikasi Eksternal (Mobile/Desktop/API)

#### Request:
```http
GET /api/peta-jabatan
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**WAJIB kirim Authorization header** dengan format `Bearer <access_token>`!

#### Contoh dengan cURL:
```bash
curl http://localhost:3000/api/peta-jabatan \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Contoh dengan Python:
```python
import requests

access_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

headers = {
    'Authorization': f'Bearer {access_token}'
}

response = requests.get('http://localhost:3000/api/peta-jabatan', headers=headers)
peta_data = response.json()

print(peta_data)
```

#### Contoh dengan JavaScript (Node.js):
```javascript
const fetch = require('node-fetch');

async function getPetaJabatan(accessToken) {
  const response = await fetch('http://localhost:3000/api/peta-jabatan', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  return data;
}

// Gunakan token dari login
const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
getPetaJabatan(accessToken).then(data => {
  console.log('Peta Jabatan:', data);
});
```

#### Contoh dengan Java:
```java
Request request = new Request.Builder()
    .url(BASE_URL + "/api/peta-jabatan")
    .header("Authorization", "Bearer " + accessToken)
    .get()
    .build();

Response response = client.newCall(request).execute();
String jsonData = response.body().string();
```

#### Contoh dengan Dart (Flutter):
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

Future<Map<String, dynamic>> getPetaJabatan(String accessToken) async {
  final response = await http.get(
    Uri.parse('http://localhost:3000/api/peta-jabatan'),
    headers: {
      'Authorization': 'Bearer $accessToken',
    },
  );
  
  if (response.statusCode == 200) {
    return json.decode(response.body);
  } else {
    throw Exception('Failed to load data');
  }
}
```

#### Response:
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid-123",
      "parent_id": null,
      "nama_jabatan": "Sekretaris Jenderal",
      "slug": "sekretaris-jenderal",
      "unit_kerja": "Sekretariat Jenderal",
      "level": 0,
      "bezetting": 1,
      "kebutuhan_pegawai": 1,
      "is_pusat": true,
      "jenis_jabatan": "Struktural",
      "kelas_jabatan": "Eselon I",
      "nama_pejabat": ["Dr. John Doe"],
      "jabatan_id": "uuid-456"
    }
  ]
}
```

---

## 🔄 3. REFRESH TOKEN

Ketika access token expired (setelah 60 menit), gunakan refresh token untuk mendapatkan token baru.

### A. Untuk Web Browser

Browser otomatis handle refresh via cookies. Atau bisa manual trigger:

```javascript
const response = await fetch('http://localhost:3000/api/auth/refresh', {
  method: 'POST',
  credentials: 'include'
});

const result = await response.json();
console.log(result.message); // "Token refreshed"
```

### B. Untuk Aplikasi Eksternal

#### Request (Opsi 1 - via Body):
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Request (Opsi 2 - via Header):
```http
POST /api/auth/refresh
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response:
```json
{
  "ok": true,
  "message": "Token refreshed",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[NEW]",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[NEW]",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Penting:** Refresh token juga di-rotate (diganti yang baru). Simpan kedua token yang baru!

#### Contoh Auto-Refresh dengan Python:
```python
import requests
from datetime import datetime, timedelta

class ApiClient:
    def __init__(self):
        self.access_token = None
        self.refresh_token = None
        self.token_expires_at = None
    
    def login(self, email, password):
        response = requests.post('http://localhost:3000/api/auth/login', json={
            'email': email,
            'password': password
        })
        data = response.json()
        
        self.access_token = data['access_token']
        self.refresh_token = data['refresh_token']
        self.token_expires_at = datetime.now() + timedelta(seconds=data['expires_in'])
    
    def refresh_if_needed(self):
        if datetime.now() >= self.token_expires_at - timedelta(minutes=5):
            # Refresh 5 menit sebelum expired
            response = requests.post('http://localhost:3000/api/auth/refresh', json={
                'refresh_token': self.refresh_token
            })
            data = response.json()
            
            self.access_token = data['access_token']
            self.refresh_token = data['refresh_token']
            self.token_expires_at = datetime.now() + timedelta(seconds=data['expires_in'])
    
    def get_peta_jabatan(self):
        self.refresh_if_needed()
        
        headers = {'Authorization': f'Bearer {self.access_token}'}
        response = requests.get('http://localhost:3000/api/peta-jabatan', headers=headers)
        return response.json()

# Usage
client = ApiClient()
client.login('admin@example.com', 'password123')
data = client.get_peta_jabatan()
```

---

## ⚠️ Error Handling

### 401 Unauthorized
```json
{
  "error": "Unauthorized, Silakan login kembali"
}
```

**Artinya:** Access token invalid/expired dan refresh gagal.  
**Action:** User harus login ulang.

### 403 Forbidden
```json
{
  "error": "Akses ditolak"
}
```

**Artinya:** User tidak punya akses ke resource (misal: bukan admin).

### 400 Bad Request
```json
{
  "error": "Email & password wajib dikirim"
}
```

**Artinya:** Request body tidak sesuai format.

---

## 📋 Perbandingan: Browser vs Aplikasi Eksternal

| Aspek | Web Browser | Aplikasi Eksternal |
|-------|-------------|-------------------|
| **Storage Token** | HTTP-only cookies (otomatis) | Manual (localStorage/memory/secure storage) |
| **Kirim Token** | Otomatis via cookies | Manual via `Authorization: Bearer` header |
| **Login Request Body** | `{email, password}` | `{email, password}` |
| **Login Response** | Tokens di body (opsional) + Set-Cookie | Tokens di body (wajib diambil) |
| **API Request Header** | TIDAK PERLU `Authorization` | WAJIB `Authorization: Bearer <token>` |
| **API Request Credentials** | `credentials: 'include'` | Tidak perlu |
| **Security** | ✅✅✅ Sangat aman (XSS-proof) | ⚠️ Tergantung implementasi storage |
| **Refresh Token** | Otomatis/manual | Manual (cek expired & refresh) |
| **CORS** | Perlu same-origin atau CORS config | Tidak terbatas origin |

---

## 🔒 Best Practices untuk Aplikasi Eksternal

### 1. **Simpan Token dengan Aman**
- ✅ **Mobile:** Keychain (iOS), Keystore (Android)
- ✅ **Desktop:** Secure credential manager
- ❌ **JANGAN:** Plain text file, UserDefaults, SharedPreferences

### 2. **Implementasi Auto-Refresh**
```javascript
// Contoh pseudo-code
async function apiRequest(url, options = {}) {
  // Cek apakah token akan expired dalam 5 menit
  if (isTokenExpiring(accessToken)) {
    await refreshToken();
  }
  
  // Baru request dengan token yang fresh
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`
    }
  });
}
```

### 3. **Handle 401 Error**
```javascript
async function apiRequest(url, options = {}) {
  let response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  // Jika 401, coba refresh
  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    
    if (refreshed) {
      // Retry dengan token baru
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
    } else {
      // Refresh gagal, redirect ke login
      redirectToLogin();
    }
  }
  
  return response;
}
```

### 4. **Jangan Simpan Password**
- ❌ JANGAN simpan password user
- ✅ HANYA simpan tokens
- ✅ Jika user logout, hapus tokens

### 5. **Set Timeout untuk Requests**
```python
import requests

response = requests.get(
    'http://localhost:3000/api/peta-jabatan',
    headers={'Authorization': f'Bearer {access_token}'},
    timeout=10  # 10 detik timeout
)
```

---

## 🧪 Testing dengan Postman

### 1. Login
```
Method: POST
URL: http://localhost:3000/api/auth/login
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "email": "admin@example.com",
  "password": "password123"
}
```

Copy `access_token` dari response.

### 2. Get Peta Jabatan
```
Method: GET
URL: http://localhost:3000/api/peta-jabatan
Headers:
  Authorization: Bearer <paste_access_token_here>
```

---

## 📞 Support

Jika ada pertanyaan atau issue:
1. Check error response message
2. Verify token format & expiration
3. Check network connectivity
4. Pastikan endpoint URL benar

---

**Happy Coding! 🚀**
