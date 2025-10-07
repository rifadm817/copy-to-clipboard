app.get('/shorten/*', (req, res) => {
    try {
        // ADD THESE HEADERS TO PREVENT CACHING
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

        // Fire and forget (this is already correct)
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
