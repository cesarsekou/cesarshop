const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());

// Middleware pour lire le JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lemontini2025";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "lemontini_super_secret_token";

// Initialisation Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const requireAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1] === ADMIN_API_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
};

// Utils mapping Supabase -> Frontend
const mapOrder = (row) => {
    let order = {
        transactionId: row.transaction_id,
        fullName: row.full_name,
        phone: row.phone,
        city: row.city,
        address: row.address,
        instructions: row.instructions,
        totalAmount: row.total_amount,
        paymentType: row.payment_type,
        status: row.status,
        items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
    if (row.driver_id && row.drivers) {
        let drv = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
        if (drv) {
            order.driver = { id: row.driver_id, name: drv.name, phone: drv.phone };
        }
    }
    return order;
};

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: ADMIN_API_TOKEN });
    } else {
        res.json({ success: false });
    }
});

app.use(express.static(__dirname));

// ── WAVE API ──
app.post('/api/create-wave-session', async (req, res) => {
    try {
        const { amount, currency, success_url, error_url, client_reference } = req.body;
        const WAVE_API_KEY = process.env.WAVE_API_KEY || 'wave_ci_prod_votre_cle_secrete';

        const response = await fetch('https://api.wave.com/v1/checkout/sessions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WAVE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount.toString(), currency, success_url, error_url, client_reference })
        });
        res.json(await response.json());
    } catch(err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.post('/api/wave-webhook', (req, res) => {
    res.status(200).send('OK');
});

// ── API LIVREUR ──
app.get('/api/driver/auth', async (req, res) => {
    const { id } = req.query;
    try {
        const { data, error } = await supabase.from('drivers').select('*').eq('id', id).single();
        if (data && !error) return res.json({ success: true, driver: data });
        res.json({ success: false });
    } catch(e) { res.json({ success: false }); }
});

app.get('/api/orders/all', async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*, drivers(*)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data.map(mapOrder));
    } catch(e) { res.json([]); }
});

app.post('/api/driver/claim', async (req, res) => {
    const { orderId, driverId } = req.body;
    try {
        const { data: order } = await supabase.from('orders').select('driver_id').eq('transaction_id', orderId).single();
        if (!order || order.driver_id) return res.status(400).json({ success: false });
        
        const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
            if (!driver) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Vous n'êtes pas inscrit. Tapez /inscription VotreNom VotreNumero", show_alert: true });
            }
            if (driver.active === false) {
                return bot.answerCallbackQuery(query.id, { text: "⏳ Votre compte est en attente d'approbation par l'administrateur.", show_alert: true });
            }

                return bot.answerCallbackQuery(query.id, { text: "⚠️ Vous n'êtes pas inscrit comme livreur. Tapez /inscription VotreNom VotreNumero" , show_alert: true });
            }
            
            const { data: order } = await supabase.from('orders').select('*').eq('transaction_id', orderId).single();
            if (!order) return bot.answerCallbackQuery(query.id, { text: "Commande introuvable" });
            
            if (order.driver_id) {
                const { data: existingDriver } = await supabase.from('drivers').select('name').eq('id', order.driver_id).single();
                return bot.answerCallbackQuery(query.id, { text: `❌ Déjà prise par ${existingDriver ? existingDriver.name : 'un autre livreur'}`, show_alert: true });
            }
            
            await supabase.from('orders').update({
                driver_id: driverId,
                status: 'livre',
                updated_at: new Date().toISOString()
            }).eq('transaction_id', orderId);
            
            bot.editMessageText(header + msgBody, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Envoyer WhatsApp au Client', url: waUrl }],
                        [{ text: '✅ Marquer comme Livré', callback_data: `status_${orderId}_done` }]
                    ]
                }
            }).catch(err => {});
        }
    });
    
    bot.onText(/\/inscription (.+) (.+)/, async (msg, match) => {
        const driverId = msg.from.id.toString();
        const name = match[1];
        const phone = match[2];
        
        await supabase.from('drivers').upsert({ id: driverId, name, phone });
        
        bot.sendMessage(msg.chat.id, `✅ Inscription réussie !\n\nNom: *${name}*\nTéléphone: *${phone}*\n\nVous recevrez désormais les propositions de livraison.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/id/, (msg) => {
        bot.sendMessage(msg.chat.id, `👤 *Information Utilisateur*\n\nNom: ${msg.from.first_name}\nID: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
    });

    (driverBot || bot).onText(/^s*/livreur(@\w+)?\s*$/, (msg) => {
        const webAppUrl = `http://localhost:3000/driver_app.html`;
        bot.sendMessage(msg.chat.id, "📦 *Espace Livreur Lemontini*\n\nCliquez sur le bouton ci-dessous pour gérer vos livraisons.", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Ouvrir mon Espace", web_app: { url: webAppUrl } }]] }
        });
    });
    
    bot.onText(/\/resume/, async (msg) => {
        const today = new Date().toISOString().split('T')[0];
        const { data: orders } = await supabase.from('orders').select('*').gte('created_at', today);
        
        const todayOrders = orders || [];
        const nouveau = todayOrders.filter(o => o.status === 'nouveau').length;
        const prepare = todayOrders.filter(o => o.status === 'confirme').length;
        const livre = todayOrders.filter(o => o.status === 'livre').length;
        const totalAmount = todayOrders.filter(o => o.status !== 'annule').reduce((acc, o) => acc + Number(o.total_amount), 0);
        
        let report = `📊 *RÉSUMÉ DU JOUR*\n\n🆕 Nouveau(x) : *${nouveau}*\n📦 En prépa : *${prepare}*\n✅ Livré(s) : *${livre}*\n\n💰 CA généré : *${Number(totalAmount).toLocaleString('fr-FR')} FCFA*`;
        bot.sendMessage(msg.chat.id, report, {parse_mode: 'Markdown'});
    });
}

// ── API BOUTIQUE / ADMIN ──
app.get('/api/orders/track/:id', async (req, res) => {
    try {
        const { data: order } = await supabase.from('orders').select('*, drivers(*)').eq('transaction_id', req.params.id).single();
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });
        
        const safeOrder = mapOrder(order);
        res.json({
            transactionId: safeOrder.transactionId,
            status: safeOrder.status,
            createdAt: safeOrder.createdAt,
            totalAmount: safeOrder.totalAmount,
            driver: safeOrder.driver || null
        });
    } catch(err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*, drivers(*)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data.map(mapOrder));
    } catch(err) { res.json([]); }
});

app.get('/api/reviews', async (req, res) => {
    try {
        const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
        res.json(data || []);
    } catch(e) { res.json([]); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const review = req.body;
        await supabase.from('reviews').insert({
            author: review.author,
            rating: review.rating,
            product: review.product,
            comment: review.comment
        });
        
        if (bot && chatId) {
            const starText = "⭐".repeat(review.rating);
            const msg = `🌟 *NOUVEL AVIS REÇU !*\n\n👤 *Auteur :* ${review.author}\n⭐ *Note :* ${starText}\n📦 *Produit :* ${review.product}\n💬 *Commentaire :*\n"${review.comment}"`;
            (driverBot || bot).sendMessage(driverChatId, msg, { parse_mode: 'Markdown' });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).send("Error"); }
});

app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await supabase.from('orders').update({
            status,
            updated_at: new Date().toISOString()
        }).eq('transaction_id', id);
        
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        
        await supabase.from('orders').insert({
            transaction_id: order.transactionId,
            full_name: order.fullName,
            phone: order.phone,
            city: order.city,
            address: order.address,
            instructions: order.instructions || '',
            total_amount: order.totalAmount,
            payment_type: order.paymentType,
            status: 'nouveau',
            items: order.items || []
        });

        if (bot && chatId) {
            const itemsList = (order.items||[]).map(i => `• ${i.qty}x ${i.name}`).join('\n');
            const paymentTypeMsg = order.paymentType === 'cash' ? '💵 Espèces' : order.paymentType === 'wave' ? '💙 Wave' : '🟠 Orange';
            
            const msg = `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🚨 *NOUVELLE COMMANDE !* 🚨\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 *Réf :* \`${order.transactionId}\` \n` +
                        `📍 *QUARTIER :* *${order.city.toUpperCase()}*\n` +
                        `🏠 *LIEU :* ${order.address}\n\n` +
                        `💰 *MONTANT :* *${Number(order.totalAmount).toLocaleString('fr-FR')} FCFA*\n\n` +
                        `📦 *ARTICLES :*\n${itemsList}\n\n` +
                        `💳 *PAIEMENT :* ${paymentTypeMsg}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `👇 _Livreurs, cliquez ci-dessous pour prendre la course_`;
                        
            (driverBot || bot).sendMessage(driverChatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🛵 JE M\'EN OCCUPE !', callback_data: `claim_${order.transactionId}` }
                        ],
                        [
                            { text: '⚙️ Gérer (Admin Only)', callback_data: `status_${order.transactionId}_confirme` }
                        ]
                    ]
                }
            }).catch(err => console.error("Telegram error:", err));
        }

        res.json({ success: true, orderId: order.transactionId });
    } catch(err) {
        console.error('Erreur sauvegarde:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Le serveur e-commerce avec SUPABASE est DÉMARRÉ sur http://localhost:${PORT}`);
});
