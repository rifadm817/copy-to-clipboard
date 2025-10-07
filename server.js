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

// Fire and forget helper to prevent request cancellation
function fireAndForget(url) {
    setImmediate(() => {
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    response.text().then(text => 
                        console.error('Failed to log to n8n:', text)
                    ).catch(() => {});
                }
            })
            .catch(error => console.error('Failed to log to n8n:', error));
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
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    
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

        // Retrieve the long URL from n8n
        const response = await fetch(`${N8N_WEBHOOK_URL}?${params.toString()}`);
        
        if (!response.ok) {
            console.error(`Failed to retrieve URL from sheet. Status: ${response.status}`);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        // Get the response text first
        const responseText = await response.text();
        
        // Check if response is empty
        if (!responseText || responseText.trim() === '') {
            console.error('N8N returned empty response');
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        // Try to parse JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('Error parsing n8n response:', e);
            console.error('Response was:', responseText);
            return res.status(404).json({ error: 'Short URL not found' });
        }
        
        if (!data || !data.longUrl) {
            console.error('No longUrl in response:', data);
            return res.status(404).json({ error: 'Short URL not found' });
        }

        // ✅ FIX: Use 302 (temporary) instead of 301 (permanent) to prevent browser caching
        return res.redirect(302, data.longUrl);
    } catch (error) {
        console.error('Error retrieving shortened URL:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
