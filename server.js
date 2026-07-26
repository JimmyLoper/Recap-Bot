require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Needed to read req.body on PUT /bet/:betId (inline edit endpoint below).
app.use(express.json());

// ------------------------------------------------------------
// GET /history?token=...
// Public bet history page for a capper, reached via their personal link.
// ------------------------------------------------------------
app.get('/history', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(404).send(renderErrorPage('Invalid or expired link'));
    }

    try {
        const { rows: capperRows } = await db.query(
            `SELECT capper_name, username, user_id FROM capper_info WHERE token = $1`,
            [token]
        );

        if (capperRows.length === 0) {
            return res.status(404).send(renderErrorPage('Invalid or expired link'));
        }

        const capper = capperRows[0];

        const { rows: bets } = await db.query(
            `SELECT id, timestamp, sport, bet_description, odds, risk, payout, result
             FROM bets
             WHERE user_id = $1
             ORDER BY timestamp DESC`,
            [capper.user_id]
        );

        const stats = calculateStats(bets);
        return res.send(renderCapperPage(capper, stats, bets, token));
    } catch (err) {
        console.error('Error in /history route:', err);
        return res.status(500).send(renderErrorPage('Something went wrong loading this page'));
    }
});

// ------------------------------------------------------------
// PUT /bet/:betId
// Inline edit endpoint for a capper's own bet row on their /history page.
// The token identifies the capper; bet ownership is re-checked server-side
// against the DB so a crafted request can never edit another capper's bet.
// ------------------------------------------------------------
app.put('/bet/:betId', async (req, res) => {
    const { betId } = req.params;
    const { token, sport, bet_description, odds, risk, payout, result, timestamp } = req.body || {};

    if (!token) {
        return res.status(403).send({ error: 'Missing token' });
    }

    try {
        const { rows: capperRows } = await db.query(
            `SELECT user_id FROM capper_info WHERE token = $1`,
            [token]
        );

        if (capperRows.length === 0) {
            return res.status(403).send({ error: 'Invalid token' });
        }

        const { user_id } = capperRows[0];

        const { rows: betRows } = await db.query(
            `SELECT user_id FROM bets WHERE id = $1`,
            [betId]
        );

        // Compare as strings — user_id is bigint in the DB, and JS Number
        // conversion can lose precision on large Discord IDs.
        if (betRows.length === 0 || String(betRows[0].user_id) !== String(user_id)) {
            return res.status(403).send({ error: 'Not authorized to edit this bet' });
        }

        const { rows: updatedRows } = await db.query(
            `UPDATE bets SET
                sport = $1,
                bet_description = $2,
                odds = $3,
                risk = $4,
                payout = $5,
                result = $6,
                timestamp = $7
             WHERE id = $8 AND user_id = $9
             RETURNING *`,
            [sport, bet_description, odds, risk, payout, result, timestamp, betId, user_id]
        );

        return res.status(200).send(updatedRows[0]);
    } catch (err) {
        console.error('Error in PUT /bet/:betId route:', err);
        return res.status(500).send({ error: 'Something went wrong updating this bet' });
    }
});

// ------------------------------------------------------------
// HTTP Basic Auth guard for /admin. Using the Authorization header
// (browser's native login prompt) instead of a ?key= query param means
// the secret never appears in the URL — so it isn't written to server/
// proxy access logs, browser history, or leaked via the Referer header
// if the admin clicks a /history link from this page.
// ------------------------------------------------------------
function requireAdminAuth(req, res, next) {
    const adminKey = process.env.ADMIN_KEY;
    const authHeader = req.headers.authorization || '';

    const challenge = () => {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Unauthorized');
    };

    if (!adminKey || !authHeader.startsWith('Basic ')) {
        return challenge();
    }

    // Basic Auth sends "username:password" base64-encoded; only the
    // password half is checked against ADMIN_KEY (username is ignored).
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);

    if (!safeCompare(password, adminKey)) {
        return challenge();
    }

    next();
}

// ------------------------------------------------------------
// GET /admin
// Lists every capper with a clickable /history link (or a "no link yet"
// note). Protected by requireAdminAuth above.
// ------------------------------------------------------------
app.get('/admin', requireAdminAuth, async (req, res) => {
    try {
        const { rows: cappers } = await db.query(
            `SELECT capper_name, username, user_id, token FROM capper_info ORDER BY capper_name ASC`
        );

        return res.send(renderAdminPage(cappers));
    } catch (err) {
        console.error('Error in /admin route:', err);
        return res.status(500).send(renderErrorPage('Something went wrong loading this page'));
    }
});

// Constant-time comparison to avoid leaking the secret's length/content via response timing.
function safeCompare(provided, expected) {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function renderAdminPage(cappers) {
    const rows = cappers.map(c => {
        if (c.token) {
            return `<li><a href="/history?token=${encodeURIComponent(c.token)}">${escapeHtml(c.capper_name)}</a></li>`;
        }
        return `<li>${escapeHtml(c.capper_name)} <span class="no-link">— No link generated yet</span></li>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head><title>Admin — Capper Links</title>
<style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 22px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 10px 0; border-bottom: 1px solid #eee; }
    a { color: #1a73e8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .no-link { color: #888; }
</style>
</head>
<body>
<h1>Capper Links</h1>
<ul>${rows}</ul>
</body></html>`;
}

// ------------------------------------------------------------
// Compute summary stats from a capper's bets.
// ROI is based on settled bets only (win/loss/push) — pending bets
// haven't resolved yet, so including their risk would distort ROI.
// ------------------------------------------------------------
function calculateStats(bets) {
    const wins = bets.filter(b => b.result === 'win');
    const losses = bets.filter(b => b.result === 'loss');
    const pushes = bets.filter(b => b.result === 'push');
    const pending = bets.filter(b => b.result === 'pending');

    const settledRisk = [...wins, ...losses, ...pushes]
        .reduce((sum, b) => sum + parseFloat(b.risk), 0);
    const netUnits = wins.reduce((sum, b) => sum + parseFloat(b.payout), 0)
        - losses.reduce((sum, b) => sum + parseFloat(b.risk), 0);
    const roi = settledRisk > 0 ? Number(((netUnits / settledRisk) * 100).toFixed(2)) : 0;

    return {
        totalBets: bets.length,
        pending: pending.length,
        record: `${wins.length}-${losses.length}-${pushes.length}`,
        netUnits: Number(netUnits.toFixed(2)),
        roi
    };
}

// ------------------------------------------------------------
// Fills views/capper.html placeholders with capper data, stats, and bet rows.
// Uses plain string replace instead of a template engine since none was installed.
// ------------------------------------------------------------
function renderCapperPage(capper, stats, bets, token) {
    const template = fs.readFileSync(path.join(__dirname, 'views', 'capper.html'), 'utf8');

    const betRows = bets.map(bet => {
        const date = new Date(Number(bet.timestamp)).toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
        const resultLabel = bet.result.charAt(0).toUpperCase() + bet.result.slice(1);

        // Per-bet units gained/lost: win -> +payout, loss -> -risk, push/pending -> 0
        // (same convention used everywhere else in the codebase, e.g. stats-calculator.js).
        const rowUnits = bet.result === 'win' ? parseFloat(bet.payout)
            : bet.result === 'loss' ? -parseFloat(bet.risk)
            : 0;
        const rowUnitsLabel = `${rowUnits > 0 ? '+' : ''}${rowUnits.toFixed(2)}`;

        // data-* attributes cache the raw (unformatted) values so the inline
        // editor in capper.html can populate inputs and restore on Cancel
        // without having to re-parse the formatted display text.
        return `<tr data-bet-id="${escapeHtml(bet.id)}" data-timestamp="${Number(bet.timestamp)}" data-sport="${escapeHtml(bet.sport || '')}" data-desc="${escapeHtml(bet.bet_description)}" data-odds="${Number(bet.odds)}" data-risk="${parseFloat(bet.risk)}" data-payout="${parseFloat(bet.payout)}" data-result="${bet.result}">
            <td class="cell-date">${date}</td>
            <td class="cell-sport">${escapeHtml(bet.sport || '')}</td>
            <td class="desc cell-desc">${escapeHtml(bet.bet_description)}</td>
            <td class="cell-odds">${Number(bet.odds)}</td>
            <td class="cell-risk">${parseFloat(bet.risk).toFixed(2)}</td>
            <td class="cell-units cell-${bet.result}">${rowUnitsLabel}</td>
            <td class="cell-result cell-${bet.result}">${resultLabel}</td>
            <td class="cell-actions"><button class="edit-btn" type="button">Edit</button></td>
        </tr>`;
    }).join('\n');

    return template
        .replace(/{{CAPPER_NAME}}/g, escapeHtml(capper.capper_name))
        .replace(/{{USERNAME}}/g, escapeHtml(capper.username))
        .replace(/{{RECORD}}/g, stats.record)
        .replace(/{{NET_UNITS}}/g, `${stats.netUnits > 0 ? '+' : ''}${stats.netUnits}u`)
        .replace(/{{ROI}}/g, `${stats.roi}%`)
        .replace(/{{TOTAL_BETS}}/g, stats.totalBets)
        .replace(/{{PENDING}}/g, stats.pending)
        .replace(/{{TOKEN}}/g, escapeHtml(token))
        .replace(/{{BET_ROWS}}/g, betRows || '<tr><td colspan="8">No bets yet</td></tr>');
}

function renderErrorPage(message) {
    return `<!DOCTYPE html>
<html><head><title>Error</title></head>
<body style="font-family: sans-serif; text-align: center; padding-top: 100px;">
<h1>${escapeHtml(message)}</h1>
</body></html>`;
}

// Escapes DB-sourced text before inlining into HTML to prevent stored XSS.
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

app.listen(PORT, () => {
    console.log(`✅ Web server listening on port ${PORT}`);
});
