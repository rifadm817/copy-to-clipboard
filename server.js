const express = require('express');
const nanoid = require('nanoid');
const cors = require('cors');
const useragent = require('express-useragent');
const geoip = require('geoip-lite');
const requestIp = require('request-ip');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(useragent.express());
app.use(requestIp.mw());

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPV7GBDxug4pbCHteBHepy3QuVc49tLNOPgqw0i6vtOE1BNklUCB2xMJ8zcGx8kvg9/exec';

const urlDatabase = {};

function generateShortCode() {
    return nanoid().substring(0, 7);
}

function formatUrl(url) {
    url = url.trim();
    if (!url.match(/^https?:\/\//i)) {
        return `https://${url}`;
    }
    return url;
}

function getClientInfo(req) {
    const ip = req.clientIp || req.ip.replace('::ffff:', '');
    const geo = geoip.lookup(ip) || {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        timezone: 'Unknown'
    };
    const fullReferrer = req.get('Referrer') || req.get('Origin') || 'Direct';
    let referrer = 'Direct';
    try {
        const referrerUrl = new URL(fullReferrer);
        referrer = referrerUrl.hostname || 'Direct';
    } catch (e) {
        referrer = fullReferrer;
    }
    const source = req.get('sec-ch-ua') || 'Unknown Source';

    return {
        ip,
        geo,
        referrer,
        source,
        userAgent: req.useragent
    };
}

function generateCopyHtml(textToCopy) {
    // Escape backticks in textToCopy if necessary
    const safeText = textToCopy.replace(/`/g, '\\`');
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Copy to Clipboard</title>
        <style>
            body {
                margin: 0;
                padding: 20px;
                background-color: #f9f9f9;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
            }
            .container {
                text-align: center;
                background: #fff;
                padding: 20px 30px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            .copy-text {
                font-size: 16px;
                margin-bottom: 20px;
                color: #333;
            }
            .copy-button {
                background-color: #000;
                color: #fff;
                border: none;
                border-radius: 17px;
                padding: 12px 24px;
                font-size: 16px;
                cursor: pointer;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                transition: background-color 0.3s ease;
            }
            .copy-button:hover {
                background-color: #333;
            }
        </style>
    </head>
    <body>
        <script>
            const decodedText = \`${safeText}\`;

            function displayFallbackUI() {
                const displayText = decodedText.length > 100 ? decodedText.substring(0, 100) + '...' : decodedText;
                document.body.innerHTML = \`
                    <div class="container">
                        <p class="copy-text">Copy: \${displayText}</p>
                        <button class="copy-button" onclick="manualCopy()">Copy</button>
                    </div>
                \`;
            }

            window.onload = async function() {
                try {
                    await navigator.clipboard.writeText(decodedText);
                    window.close();
                    window.location.href = "about:blank";
                    window.history.pushState(null, "", window.location.href);
                    window.close();
                } catch (err) {
                    displayFallbackUI();
                }
            }

            async function manualCopy() {
                try {
                    await navigator.clipboard.writeText(decodedText);
                    window.close();
                    window.location.href = "about:blank";
                    window.history.pushState(null, "", window.location.href);
                    window.close();
                } catch (err) {
                    alert('Failed to copy. Please copy manually.');
                }
            }
        </script>
    </body>
    </html>
    `;
}


app.get('/copy/:text', (req, res) => {
    let textToCopy = decodeURIComponent(req.params.text);
    textToCopy = textToCopy.replace(/\\n/g, '\n');
    
    const clientInfo = getClientInfo(req);
    
    const params = new URLSearchParams({
        text: textToCopy,
        ip: clientInfo.ip,
        userAgent: req.get('User-Agent'),
        device: req.useragent.isMobile ? 'Mobile' : req.useragent.isTablet ? 'Tablet' : 'Desktop',
        referrer: clientInfo.referrer,
        source: clientInfo.source,
        country: clientInfo.geo.country || 'Unknown',
        city: clientInfo.geo.city || 'Unknown',
        region: clientInfo.geo.region || 'Unknown',
        timezone: clientInfo.geo.timezone || 'Unknown',
        browser: req.useragent.browser || 'Unknown',
        browserVersion: req.useragent.version || 'Unknown',
        os: req.useragent.os || 'Unknown',
        platform: req.useragent.platform || 'Unknown',
        isMobile: req.useragent.isMobile || false,
        isTablet: req.useragent.isTablet || false,
        isDesktop: req.useragent.isDesktop || false,
        language: req.get('Accept-Language') || 'Unknown',
        timestamp: new Date().toISOString()
    });

    // Fire and forget the logging to Google Sheet
    fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`)
        .then(response => {
            if (!response.ok) {
                response.text().then(text => console.error('Failed to log to Google Sheet:', text));
            }
        })
        .catch(error => console.error('Failed to log to Google Sheet:', error));

    res.send(generateCopyHtml(textToCopy));
});

app.get('/shorten/*', (req, res) => {
    try {
        const encodedLongUrl = req.params[0];

        if (!encodedLongUrl) {
            return res.status(400).json({ error: 'longUrl is required' });
        }

        const longUrl = decodeURIComponent(encodedLongUrl);
        const formattedUrl = formatUrl(longUrl);

        try {
            new URL(formattedUrl);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        const shortCode = generateShortCode();
        urlDatabase[shortCode] = formattedUrl;

        const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
        res.send(generateCopyHtml(shortUrl));

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const longUrl = urlDatabase[shortCode];

    if (!longUrl) {
        return res.status(404).json({ error: 'Short URL not found' });
    }

    return res.redirect(301, longUrl);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
