// Run this once in your DB to add token support:
// ALTER TABLE capper_info ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;

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
            `SELECT timestamp, sport, bet_description, odds, risk, payout, result
             FROM bets
             WHERE user_id = $1
             ORDER BY timestamp DESC`,
            [capper.user_id]
        );

        const stats = calculateStats(bets);
        return res.send(renderCapperPage(capper, stats, bets));
    } catch (err) {
        console.error('Error in /history route:', err);
        return res.status(500).send(renderErrorPage('Something went wrong loading this page'));
    }
});

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
function renderCapperPage(capper, stats, bets) {
    const template = fs.readFileSync(path.join(__dirname, 'views', 'capper.html'), 'utf8');

    const betRows = bets.map(bet => {
        const date = new Date(Number(bet.timestamp)).toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
        const resultLabel = bet.result.charAt(0).toUpperCase() + bet.result.slice(1);

        return `<tr>
            <td>${date}</td>
            <td>${escapeHtml(bet.sport || '')}</td>
            <td>${escapeHtml(bet.bet_description)}</td>
            <td>${Number(bet.odds)}</td>
            <td>${parseFloat(bet.risk)}u</td>
            <td>${parseFloat(bet.payout)}u</td>
            <td class="result-${bet.result}">${resultLabel}</td>
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
        .replace(/{{BET_ROWS}}/g, betRows || '<tr><td colspan="7">No bets yet</td></tr>');
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
