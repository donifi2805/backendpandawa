import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, runTransaction, getDoc, updateDoc } from "firebase/firestore";
// 1. Tambahkan import fungsi Auth dari Firebase
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

// --- KONFIGURASI TELEGRAM BOT ---
const BOT_TOKEN = "8659828786:AAGvN2hYGOBVvytFULdb7_v_hOCFDGOO7VA";

// --- KONFIGURASI FIREBASE (PROYEK BARU: PANDAWA-STORE) ---
const firebaseConfig = {
  apiKey: "AIzaSyDYj0BA6cZDUxNBA7lmxBoXzah7H4y8yu4",
  authDomain: "pandawa-store.firebaseapp.com",
  projectId: "pandawa-store",
  storageBucket: "pandawa-store.firebasestorage.app",
  messagingSenderId: "974440930132",
  appId: "1:974440930132:web:57fcb857cfd5ac51b386c1"
};

// --- FIX ERROR VERCEL CACHE (GUNAKAN NAMA APLIKASI KHUSUS) ---
const app = getApps().find(a => a.name === "PandawaBot") || initializeApp(firebaseConfig, "PandawaBot");
const db = getFirestore(app);
// 2. Inisialisasi Auth
const auth = getAuth(app);

// Fungsi pembantu untuk membalas loading Telegram agar tidak macet
async function answerCallback(callbackQueryId, text, showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        callback_query_id: callbackQueryId, 
        text: text, 
        show_alert: showAlert 
      })
    });
  } catch (e) { console.error("Gagal answer callback", e); }
}

export default async function handler(req, res) {
  // Tolak jika bukan POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 3. LOGIN OTOMATIS SEBAGAI ADMIN UNTUK MENEMBUS RULES FIREBASE
    // !!! WAJIB UBAH EMAIL DAN PASSWORD DI BAWAH INI SESUAI AKUN ADMIN ANDA !!!
    try {
      await signInWithEmailAndPassword(auth, "EMAIL_ADMIN_ANDA@gmail.com", "PASSWORD_ADMIN_ANDA");
    } catch (authError) {
      console.error("Gagal Login Firebase Auth di Vercel:", authError);
      return res.status(500).send('Error: Autentikasi Firebase Gagal');
    }

    const body = req.body;

    // =====================================================================
    // FITUR 1: BALAS CHAT CS (REPLY MESSAGE)
    // =====================================================================
    if (body.message && body.message.reply_to_message && body.message.text) {
      const adminName = "Admin Pandawa"; 
      const replyText = body.message.text;
      const originalText = body.message.reply_to_message.text || "";
      const chatId = body.message.chat.id; 

      let refId = "";
      let originalName = "User";
      let originalMsg = "Pesan";

      const matchNama = originalText.match(/Nama:\s*([^\n]+)/);
      const matchRefId = originalText.match(/RefID:\s*([^\n]+)/);
      if (matchNama) originalName = matchNama[1].trim();
      if (matchRefId) refId = matchRefId[1].trim();

      if (originalText.includes("💬 Pesan:")) {
          originalMsg = originalText.split("💬 Pesan:")[1].trim();
      } else if (originalText.includes("Pesan:")) {
          originalMsg = originalText.split("Pesan:")[1].trim();
      }

      const chatData = {
        id: "msg_" + Date.now(),
        uid: "ADMIN",
        nama: adminName,
        pesan: replyText,
        timestamp: Date.now(),
        role: "admin",
        reply_to: {
            id: refId,
            name: originalName,
            text: originalMsg.substring(0, 60) + (originalMsg.length > 60 ? '...' : '')
        }
      };

      const roomRef = doc(db, 'chat_public', 'room_global');
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        let msgsArr = docSnap.exists() ? (docSnap.data().messages || []) : [];
        msgsArr.push(chatData);
        if (msgsArr.length > 40) msgsArr = msgsArr.slice(msgsArr.length - 40);
        transaction.set(roomRef, { messages: msgsArr }, { merge: true });
      });

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ <b>Balasan Terkirim ke Web!</b>",
          parse_mode: "HTML",
          reply_to_message_id: body.message.message_id
        })
      });

      return res.status(200).send('OK: Chat Terkirim');
    }

    // =====================================================================
    // FITUR 2: TOMBOL TERIMA/TOLAK TOPUP (CALLBACK QUERY)
    // =====================================================================
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const originalText = cb.message.text || "";

      if (data && (data.startsWith('A_') || data.startsWith('R_'))) {
        const parts = data.split('_');
        const action = parts[0]; 
        const docId = parts[1];
        const uid = parts[2];

        try {
          const trxRef = doc(db, "users", uid, "riwayat_transaksi", docId);
          const trxSnap = await getDoc(trxRef);
          
          if (!trxSnap.exists()) {
            await answerCallback(cb.id, "❌ Error: Data transaksi tidak ditemukan di Database!", true);
            return res.status(200).send('OK: Not Found');
          }

          const trxData = trxSnap.data();
          
          if (trxData.status !== 'PENDING') {
            await answerCallback(cb.id, "⚠️ Transaksi ini sudah diproses atau dibatalkan sebelumnya!", true);
            return res.status(200).send('OK: Sudah diproses');
          }

          let updatedText = originalText;

          if (action === 'A') {
            const nominal = trxData.harga;
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            const currentSaldo = userSnap.exists() ? (userSnap.data().saldo || 0) : 0;
            const newSaldo = currentSaldo + nominal;

            // 1. Update Saldo & Status
            await updateDoc(userRef, { saldo: newSaldo });
            await updateDoc(trxRef, { status: "BERHASIL", sn: "Topup Berhasil (Via Bot Telegram)" });

            // 2. Sinkronisasi DoniGuard
            try {
              await fetch('https://pandawa-digital.com/doniguard.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    uid: uid, 
                    action: 'topup', 
                    nominal: nominal, 
                    trx_id: trxData.trx_id || docId, 
                    produk: 'TOPUP MANUAL VALIDASI BOT', 
                    saldo_akhir_client: newSaldo 
                })
              });
            } catch(dgError) { console.error("DoniGuard Error:", dgError); }

            updatedText += `\n\n✅ *STATUS: TOPUP DISETUJUI*\n💸 Saldo Masuk: Rp ${new Intl.NumberFormat('id-ID').format(nominal)}`;
            await answerCallback(cb.id, `✅ Topup Rp ${new Intl.NumberFormat('id-ID').format(nominal)} Disetujui!`, false);

          } else if (action === 'R') {
            await updateDoc(trxRef, { status: "GAGAL", sn: "Ditolak via Bot Telegram" });
            updatedText += `\n\n❌ *STATUS: TOPUP DITOLAK*`;
            await answerCallback(cb.id, "❌ Topup telah ditolak!", false);
          }

          // 3. Edit Pesan di Telegram (Hilangkan Tombol)
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: chatId, 
              message_id: messageId, 
              text: updatedText, 
              parse_mode: "Markdown" 
            })
          });

          return res.status(200).send('OK: Callback Processed');

        } catch (trxError) {
          console.error("Firebase Process Error:", trxError);
          await answerCallback(cb.id, "❌ Terjadi kesalahan pada server Firebase.", true);
          return res.status(200).send('OK: Error handled');
        }
      }
    }

    return res.status(200).send('OK: Ignored');

  } catch (error) {
    console.error("Global Webhook Error:", error);
    return res.status(500).send('Error: ' + error.message);
  }
}
