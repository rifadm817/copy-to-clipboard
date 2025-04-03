import express from 'express';
import { nanoid } from 'nanoid';
import cors from 'cors';
import useragent from 'express-useragent';
import geoip from 'geoip-lite';
import requestIp from 'request-ip';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(useragent.express());
app.use(requestIp.mw());

const N8N_WEBHOOK_URL = 'https://n8n-personal.up.railway.app/webhook/copy-to-clipboard';

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                max-width: 400px;
                width: 100%;
            }
            .copy-text {
                font-size: 16px;
                margin-bottom: 20px;
                color: #333;
                word-wrap: break-word;
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
                width: 100%;
            }
            .copy-button:hover {
                background-color: #333;
            }
            @media (max-width: 480px) {
                .container {
                    padding: 20px;
                    max-width: 90%;
                }
                .copy-text {
                    font-size: 18px;
                }
                .copy-button {
                    font-size: 18px;
                    padding: 14px;
                }
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
        action: 'copy',
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
        timestamp: new Date().toISOString(),
        route: 'copy'
    });

    // Fire and forget the logging to n8n
    fetch(`${N8N_WEBHOOK_URL}?${params.toString()}`)
        .then(response => {
            if (!response.ok) {
                response.text().then(text => console.error('Failed to log to n8n:', text));
            }
        })
        .catch(error => console.error('Failed to log to n8n:', error));

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
        const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
        
        const clientInfo = getClientInfo(req);
        
        const params = new URLSearchParams({
            action: 'shorten',
            text: shortUrl, // Set as text for sheet compatibility
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
            timestamp: new Date().toISOString(),
            route: 'shorten',
            shortCode: shortCode,
            longUrl: formattedUrl
        });

        // Fire and forget the logging to n8n
        fetch(`${N8N_WEBHOOK_URL}?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    response.text().then(text => console.error('Failed to store shortened URL in sheet:', text));
                }
            })
            .catch(error => console.error('Failed to log to n8n:', error));

        res.send(generateCopyHtml(shortUrl));

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    
    try {
        const clientInfo = getClientInfo(req);
        const params = new URLSearchParams({
            action: 'retrieve',
            shortCode: shortCode,
            // Include all analytics info in the retrieve request
            ip: clientInfo.ip,
            userAgent: req.get('User-Agent'),
            device: req.useragent.isMobile ? 'Mobile' : req.useragent.isTablet ? 'Tablet' : 'Desktop',
            referrer: clientInfo.referrer,
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
            timestamp: new Date().toISOString(),
            // You could add this to differentiate in your logs
            route: 'retrieve'
        });

        // Retrieve the long URL from n8n
        const response = await fetch(`${N8N_WEBHOOK_URL}?${params.toString()}`);
        
        if (!response.ok) {
            console.error('Failed to retrieve URL from sheet');
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        let data;
        try {
            data = await response.json();
        } catch (e) {
            console.error('Error parsing n8n response:', e);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        if (!data || !data.longUrl) {
            return res.status(404).json({ error: 'Short URL not found' });
        }

        // Redirect to the long URL (no need for additional tracking request)
        return res.redirect(301, data.longUrl);
    } catch (error) {
        console.error('Error retrieving shortened URL:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
