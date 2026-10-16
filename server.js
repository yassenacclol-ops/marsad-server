const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcode2 = require('qrcode');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log('❌ لازم تحط SUPABASE_URL و SUPABASE_SECRET_KEY في Render Environment');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

let lastQr = '';

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: 'auth_info' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
    lastQr = qr;
    console.log('امسح الـ QR ده:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ مرصد اشتغل!');
});

async function getPlayer(id) {
    let { data } = await supabase.from('players').select('*').eq('id', id).single();
    if (!data) {
        const { data: newPlayer } = await supabase.from('players').insert({ id, balance: 1000 }).select().single();
        data = newPlayer;
    }
    return data;
}

async function getEyeGame() {
    const { data } = await supabase.from('eye_images').select('*');
    if (!data || data.length === 0) return null;
    return data[Math.floor(Math.random() * data.length)];
}

client.on('message', async msg => {
    try {
        if (msg.from.endsWith('@g.us')) return;
        
        const body = msg.body.trim();
        const playerId = msg.from;
        
        if (body === '!رصيد' || body === '!فلوس') {
            const p = await getPlayer(playerId);
            return msg.reply(`💰 رصيدك: ${p.balance} عملة\n⭐ لفل: ${p.level} | XP: ${p.xp}`);
        }

        if (body === '!مزرعه' || body === '!مزرعة') {
            const { data: shop } = await supabase.from('farm_shop').select('*');
            let txt = '🌾 *متجر المزرعة*\n\n';
            shop.forEach(s => {
                txt += `${s.icon} ${s.name} - ${s.price} عملة - ID: ${s.id}\n`;
            });
            txt += '\nللزراعة: !ازرع [id]';
            return msg.reply(txt);
        }

        if (body.startsWith('!ازرع')) {
            const seedId = body.split(' ')[1];
            if (!seedId) return msg.reply('اكتب: !ازرع wheat');
            
            const { data: seed } = await supabase.from('farm_shop').select('*').eq('id', seedId).single();
            if (!seed) return msg.reply('البذرة مش موجودة');
            
            const player = await getPlayer(playerId);
            if (player.balance < seed.price) return msg.reply('فلوسك مش كفاية');
            
            await supabase.from('players').update({ balance: player.balance - seed.price }).eq('id', playerId);
            const readyAt = new Date(Date.now() + seed.growth_time_minutes * 60000);
            await supabase.from('farm_plots').insert({ player_id: playerId, seed_id: seedId, ready_at: readyAt.toISOString() });
            return msg.reply(`🌱 زرعت ${seed.name}! هتكون جاهزة بعد ${seed.growth_time_minutes} دقيقة. اكتب !حصاد`);
        }

        if (body === '!حصاد' || body === '!حصد') {
            const { data: plots } = await supabase.from('farm_plots').select('*, farm_shop(*)').eq('player_id', playerId).eq('claimed', false);
            if (!plots || plots.length === 0) return msg.reply('مفيش حاجة تتجمع');
            
            let total = 0;
            for (let plot of plots) {
                if (new Date(plot.ready_at) <= new Date()) {
                    total += plot.farm_shop.reward;
                    await supabase.from('farm_plots').update({ claimed: true }).eq('id', plot.id);
                }
            }
            if (total === 0) return msg.reply('لسه الزرع مكبرش، استنى شوية!');
            const player = await getPlayer(playerId);
            await supabase.from('players').update({ balance: player.balance + total }).eq('id', playerId);
            return msg.reply(`🎉 حصدت ${total} عملة!`);
        }

        if (body === '!عين' || body === '!عين_انمي') {
            const eye = await getEyeGame();
            if (!eye) return msg.reply('لسه مفيش صور، ضيف صور من Supabase > eye_images');
            await client.sendMessage(msg.from, eye.image_url, { caption: `👁️ مين صاحب العين دي؟\nاكتب: !جواب ${eye.character_name}` });
            global.lastEyeAnswer = eye.character_name;
            global.lastEyePlayer = playerId;
            return;
        }

        if (body.startsWith('!جواب')) {
            const ans = body.replace('!جواب','').trim();
            if (global.lastEyeAnswer && global.lastEyePlayer === playerId) {
                if (ans.toLowerCase() === global.lastEyeAnswer.toLowerCase()) {
                    const p = await getPlayer(playerId);
                    await supabase.from('players').update({ balance: p.balance + 200, xp: p.xp + 50 }).eq('id', playerId);
                    global.lastEyeAnswer = null;
                    return msg.reply('✅ صح! كسبت 200 عملة و 50 XP');
                } else {
                    return msg.reply('❌ غلط، حاول تاني!');
                }
            }
        }

        if (body === '!اوامر' || body === '!مساعدة') {
            return msg.reply(`📜 *اوامر مرصد*\n\n!رصيد - تشوف فلوسك\n!مزرعه - متجر البذور\n!ازرع [id] - تزرع\n!حصاد - تحصد\n!عين - لعبة عين الانمي\n!جواب [اسم] - تجاوب على العين\n!اوامر - القائمة دي`);
        }

        const cmdId = body.replace('!','').split(' ')[0];
        const { data: custom } = await supabase.from('commands').select('*').eq('id', cmdId).eq('enabled', true).single();
        if (custom) {
            if (custom.image_url) {
                return client.sendMessage(msg.from, custom.image_url, { caption: custom.response_text });
            }
            return msg.reply(custom.response_text);
        }

    } catch (e) {
        console.log('Error:', e.message);
    }
});

client.initialize();

app.get('/', async (req, res) => {
    if (!lastQr) return res.send('<h1>مرصد شغال ✅</h1><p>لو لسه QR مطلعش استنى دقيقة واعمل ريفريش</p>');
    try {
        const qrImage = await qrcode2.toDataURL(lastQr);
        res.send(`<div style="text-align:center; font-family:sans-serif; background:#111; color:#fff; min-height:100vh; padding:20px"><h1>امسح QR لربط مرصد</h1><img src="${qrImage}" style="width:300px"><p>افتح واتساب > الاجهزة المرتبطة > ربط جهاز</p></div>`);
    } catch {
        res.send('QR جاهز، شوف اللوجز في Render');
    }
});

app.listen(PORT, () => console.log(`Web on ${PORT}`));
