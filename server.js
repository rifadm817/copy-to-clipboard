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

// ✅ Trust proxy — critical if behind Railway, Render, Cloudflare, etc.
app.set('trust proxy', true);

const N8N_WEBHOOK_URL = 'https://n8n-personal.up.railway.app/webhook/copy-to-clipboard';

// Blocked IPs
const BLOCKED_IPS = [
    '181.196.139.129',
    '91.82.97.204',
    '125.198.225.192',
    '190.57.138.250',
    '149.50.199.242',
    '96.53.71.194',
    '153.190.135.8',
    '177.37.175.73',
    '173.94.205.211',
    '177.121.110.58',
    '111.97.239.250',
    '187.44.105.65',
    '162.218.217.2',
    '104.245.20.170',
    '179.134.8.65',
    '191.187.33.39',
    '189.27.55.33',
    '112.133.192.98',
    '179.6.101.88',
    '181.39.50.214',
    '73.20.2.54',
    '189.27.54.124',
    '181.64.230.117',
    '177.121.97.125',
    '190.238.77.190',
    '188.50.174.102',
    '108.48.189.96',
    '23.158.104.184',
    '98.252.15.213',
    '23.158.104.181',
    '201.76.165.18',
    '73.127.22.8',
    '50.96.81.246',
    '122.100.229.208',
];

// Helper to clean IP from various formats
function cleanIp(raw) {
    if (!raw) return '';
    let ip = raw.trim();
    // Strip IPv6-mapped-IPv4 prefixes
    ip = ip.replace(/^::ffff:/i, '');
    // If comma-separated (X-Forwarded-For), take the first one
    if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    return ip;
}

// 🔍 AUDIT: Log every incoming request before anything else
app.use((req, res, next) => {
    const rawClientIp = req.clientIp;
    const rawExpressIp = req.ip;
    const xForwardedFor = req.headers['x-forwarded-for'] || 'none';
    const xRealIp = req.headers['x-real-ip'] || 'none';
    const cleanedIp = cleanIp(rawClientIp || rawExpressIp);

    console.log(`[AUDIT:REQUEST] ` +
        `Path: ${req.path} | ` +
        `Method: ${req.method} | ` +
        `Raw clientIp: ${rawClientIp} | ` +
        `Raw express ip: ${rawExpressIp} | ` +
        `X-Forwarded-For: ${xForwardedFor} | ` +
        `X-Real-IP: ${xRealIp} | ` +
        `Cleaned IP: ${cleanedIp} | ` +
        `Time: ${new Date().toISOString()} | ` +
        `UA: ${req.get('User-Agent')}`
    );

    // Attach cleaned IP for downstream use
    req.cleanedIp = cleanedIp;
    next();
});

// IP Block Middleware
app.use((req, res, next) => {
    const ip = req.cleanedIp;
    const isBlocked = BLOCKED_IPS.includes(ip);

    console.log(`[AUDIT:BLOCK-CHECK] IP: ${ip} | Blocked: ${isBlocked} | Path: ${req.path}`);

    if (isBlocked) {
        console.log(`[BLOCKED] ✋ IP: ${ip} | Path: ${req.path} | Time: ${new Date().toISOString()} | UA: ${req.get('User-Agent')}`);
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Access Denied</title>
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
                        padding: 30px 40px;
                        border-radius: 12px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        max-width: 450px;
                        width: 100%;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 10px;
                    }
                    h1 {
                        font-size: 22px;
                        color: #d32f2f;
                        margin-bottom: 10px;
                    }
                    p {
                        font-size: 16px;
                        color: #555;
                        line-height: 1.5;
                    }
                    a {
                        color: #1a73e8;
                        text-decoration: none;
                        font-weight: 600;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🚫</div>
                    <h1>Access Denied</h1>
                    <p>Your IP address has been blocked due to suspicious activity.</p>
                    <p>If you believe this is a mistake, please contact<br>
                        <a href="https://www.appsheetdeveloper.com" target="_blank">www.appsheetdeveloper.com</a>
                    </p>
                </div>
            </body>
            </html>
        `);
    }

    console.log(`[ALLOWED] ✅ IP: ${ip} | Path: ${req.path}`);
    next();
});

// Fire and forget helper to prevent request cancellation
function fireAndForget(url) {
    console.log(`[AUDIT:N8N-SEND] Sending to n8n: ${url.substring(0, 120)}...`);
    setImmediate(() => {
        fetch(url)
            .then(response => {
                console.log(`[AUDIT:N8N-RESPONSE] Status: ${response.status} | OK: ${response.ok}`);
                if (!response.ok) {
                    response.text().then(text => 
                        console.error('[AUDIT:N8N-ERROR] Failed to log to n8n:', text)
                    ).catch(() => {});
                }
            })
            .catch(error => console.error('[AUDIT:N8N-ERROR] Failed to log to n8n:', error));
    });
}

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
    const ip = req.cleanedIp || cleanIp(req.clientIp || req.ip);
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
    // Escape special characters properly
    const safeText = textToCopy
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
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
            .success-message {
                color: #28a745;
                font-weight: bold;
                margin-top: 10px;
                font-size: 18px;
            }
            .spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #000;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
                display: none;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
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
        <div class="container">
            <div class="spinner" id="spinner"></div>
            <p class="copy-text" id="copyText" style="display:none;"></p>
            <button class="copy-button" id="copyButton" style="display:none;" onclick="manualCopy()">Copy</button>
            <p class="success-message" id="successMessage" style="display:none;">✓ Copied!</p>
        </div>
        <script>
            const decodedText = \`${safeText}\`;

            function displayFallbackUI() {
                document.getElementById('spinner').style.display = 'none';
                const displayText = decodedText.length > 100 ? decodedText.substring(0, 100) + '...' : decodedText;
                document.getElementById('copyText').textContent = 'Copy: ' + displayText;
                document.getElementById('copyText').style.display = 'block';
                document.getElementById('copyButton').style.display = 'block';
            }

            function showSuccess() {
                document.getElementById('spinner').style.display = 'none';
                document.getElementById('successMessage').style.display = 'block';
            }

            window.onload = async function() {
                // Show spinner
                document.getElementById('spinner').style.display = 'block';
                
                // Wait a moment to ensure page is fully loaded
                await new Promise(resolve => setTimeout(resolve, 100));
                
                try {
                    await navigator.clipboard.writeText(decodedText);
                    showSuccess();
                    
                    // Wait 500ms to show success message, then close
                    setTimeout(() => {
                        window.close();
                        // If close doesn't work, try alternative
                        setTimeout(() => {
                            window.location.href = "about:blank";
                        }, 200);
                    }, 500);
                } catch (err) {
                    console.error('Auto-copy failed:', err);
                    displayFallbackUI();
                }
            }

            async function manualCopy() {
                try {
                    await navigator.clipboard.writeText(decodedText);
                    showSuccess();
                    setTimeout(() => {
                        window.close();
                        setTimeout(() => {
                            window.location.href = "about:blank";
                        }, 200);
                    }, 500);
                } catch (err) {
                    alert('Failed to copy: ' + err.message + '\\n\\nPlease copy manually.');
                }
            }
        </script>
    </body>
    </html>
    `;
}

app.get('/copy/:text', (req, res) => {
    console.log(`[AUDIT:ROUTE] /copy hit | IP: ${req.cleanedIp}`);

    // Add cache control headers
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

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

    // Use fireAndForget helper
    fireAndForget(`${N8N_WEBHOOK_URL}?${params.toString()}`);

    res.send(generateCopyHtml(textToCopy));
});

app.get('/shorten/*', (req, res) => {
    console.log(`[AUDIT:ROUTE] /shorten hit | IP: ${req.cleanedIp}`);

    try {
        // Add cache control headers to prevent caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

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
            text: shortUrl,
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

        // Use fireAndForget helper
        fireAndForget(`${N8N_WEBHOOK_URL}?${params.toString()}`);

        res.send(generateCopyHtml(shortUrl));

    } catch (error) {
        console.error('[AUDIT:ERROR] /shorten error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    
    console.log(`[AUDIT:ROUTE] /:shortCode hit | Code: ${shortCode} | IP: ${req.cleanedIp}`);

    // ✅ FIX: Add cache control headers to prevent redirect caching
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    try {
        const clientInfo = getClientInfo(req);
        const params = new URLSearchParams({
            action: 'retrieve',
            shortCode: shortCode,
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
            route: 'retrieve'
        });

        console.log(`[AUDIT:N8N-RETRIEVE] Fetching longUrl from n8n for shortCode: ${shortCode}`);

        // Retrieve the long URL from n8n
        const response = await fetch(`${N8N_WEBHOOK_URL}?${params.toString()}`);
        
        if (!response.ok) {
            console.error(`[AUDIT:N8N-RETRIEVE-FAIL] Status: ${response.status} for shortCode: ${shortCode}`);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        // Get the response text first
        const responseText = await response.text();
        
        // Check if response is empty
        if (!responseText || responseText.trim() === '') {
            console.error('[AUDIT:N8N-RETRIEVE-FAIL] Empty response for shortCode:', shortCode);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        // Try to parse JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('[AUDIT:N8N-RETRIEVE-FAIL] JSON parse error:', e);
            console.error('Response was:', responseText);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        if (!data || !data.longUrl) {
            console.error('[AUDIT:N8N-RETRIEVE-FAIL] No longUrl in response:', data);
            return res.status(404).json({ error: 'Short URL not found' });
        }

        console.log(`[AUDIT:REDIRECT] shortCode: ${shortCode} → ${data.longUrl} | IP: ${req.cleanedIp}`);

        // ✅ FIX: Use 302 (temporary) instead of 301 (permanent) to prevent browser caching
        return res.redirect(302, data.longUrl);
    } catch (error) {
        console.error('[AUDIT:ERROR] /:shortCode error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`[AUDIT:STARTUP] Server running on http://localhost:${PORT}`);
    console.log(`[AUDIT:STARTUP] Blocked IPs count: ${BLOCKED_IPS.length}`);
    console.log(`[AUDIT:STARTUP] Trust proxy: enabled`);
});
