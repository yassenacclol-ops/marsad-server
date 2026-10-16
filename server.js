const express = require('express');
const qrcode2 = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
}

let lastQr = 'مفيش QR - البوت ده مش هيشتغل على Vercel، انقله لـ Render';

// --- هنا هنشيل جزء الواتساب لأنه مش بيشتغل على Vercel ---
// لو نقلته Render رجع الكود القديم

async function getPlayer(id) {
    if (!supabase) return { balance: 1000, level: 1, xp: 0 };
    let { data } = await supabase.from('players').select('*').eq('id', id).single();
    if (!data) {
        const { data: newPlayer } = await supabase.from('players').insert({ id, balance: 1000 }).select().single();
        data = newPlayer;
    }
    return data;
}

app.get('/', async (req, res) => {
    try {
        if (!lastQr || lastQr.startsWith('مفيش')) {
            return res.send(`
                <div style="text-align:center; font-family:sans-serif; background:#111; color:#fff; min-height:100vh; padding:40px">
                    <h1>مرصد شغال ✅ على Vercel</h1>
                    <p style="color:#f55; font-size:18px">تنبيه: بوت الواتساب مش هيشتغل هنا</p>
                    <p>Vercel للمواقع بس. عشان تشغل whatsapp-web.js لازم ترفعه على Render.com</p>
                    <br><a href="https://render.com" style="color:#0af">روح لـ Render</a>
                </div>
            `);
        }
        const qrImage = await qrcode2.toDataURL(lastQr);
        res.send(`<div style="text-align:center; font-family:sans-serif; background:#111; color:#fff; min-height:100vh; padding:20px"><h1>امسح QR لربط مرصد</h1><img src="${qrImage}" style="width:300px"><p>افتح واتساب > الاجهزة المرتبطة > ربط جهاز</p></div>`);
    } catch (e) {
        res.send('Error: ' + e.message);
    }
});

// المهم لـ Vercel
module.exports = app;
