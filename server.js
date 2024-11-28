const express = require('express');
const cors = require('cors');
const useragent = require('express-useragent');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(useragent.express());

// Replace with your deployed Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPV7GBDxug4pbCHteBHepy3QuVc49tLNOPgqw0i6vtOE1BNklUCB2xMJ8zcGx8kvg9/exec';

app.get('/copy/:text', async (req, res) => {
    const textToCopy = req.params.text;
    const geo = geoip.lookup(req.ip) || {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        timezone: 'Unknown'
    };
    
    // Log data to Google Sheet
    const params = new URLSearchParams({
        text: textToCopy,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.useragent.isMobile ? 'Mobile' : req.useragent.isTablet ? 'Tablet' : 'Desktop',
        referrer: req.get('Referrer') || 'Direct',
        country: geo.country,
        city: geo.city,
        region: geo.region,
        timezone: geo.timezone,
        browser: req.useragent.browser,
        browserVersion: req.useragent.version,
        os: req.useragent.os,
        platform: req.useragent.platform,
        isMobile: req.useragent.isMobile,
        isTablet: req.useragent.isTablet,
        isDesktop: req.useragent.isDesktop,
        language: req.get('Accept-Language') || 'Unknown'
    });

    try {
        await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    } catch (error) {
        console.error('Failed to log to Google Sheet:', error);
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Copy to Clipboard</title>
        <style>
            body { margin: 0; padding: 20px; font-family: Arial; }
        </style>
    </head>
    <body>
        <script>
            window.onload = async function() {
                try {
                    await navigator.clipboard.writeText("${textToCopy}");
                    window.close(); // Direct close attempt
                    // Fallback if direct close fails
                    window.location.href = "about:blank";
                    window.history.pushState(null, "", window.location.href);
                    window.close();
                } catch (err) {
                    document.body.innerHTML = '<button onclick="manualCopy()">Click to Copy</button>';
                }
            }
            
            async function manualCopy() {
                await navigator.clipboard.writeText("${textToCopy}");
                window.close();
                // Fallback if direct close fails
                window.location.href = "about:blank";
                window.history.pushState(null, "", window.location.href);
                window.close();
            }
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});