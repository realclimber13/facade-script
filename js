const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Front-end UI served at the root URL
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Web Browser Portal</title>
        <style>
            body, html { margin: 0; padding: 0; height: 100%; font-family: sans-serif; overflow: hidden; background: #1a1a1a; color: #fff; }
            #nav-bar { height: 50px; background: #2d2d2d; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; }
            #url-bar { flex-grow: 1; height: 32px; border-radius: 4px; border: 1px solid #444; background: #3c3c3c; color: #fff; padding: 0 10px; margin-right: 10px; }
            #url-bar:focus { outline: none; border-color: #007bff; }
            #go-btn { height: 32px; padding: 0 20px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; }
            #view-frame { width: 100%; height: calc(100% - 50px); border: none; background: #fff; }
        </style>
    </head>
    <body>
        <div id="nav-bar">
            <input type="text" id="url-bar" placeholder="Enter website URL (e.g., google.com)">
            <button id="go-btn" onclick="browse()">Go</button>
        </div>
        <iframe id="view-frame" src="about:blank"></iframe>
        <script>
            function browse() {
                let target = document.getElementById('url-bar').value.trim();
                if (!target) return;
                if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
                document.getElementById('view-frame').src = window.location.origin + '/proxy?url=' + encodeURIComponent(target);
            }
            document.getElementById('url-bar').addEventListener('keypress', (e) => { if (e.key === 'Enter') browse(); });
        </script>
    </body>
    </html>
    `);
});

// The proxy routing system
app.all('/proxy', async (req, res) => {
    let targetUrl = req.query.url || req.body.url;
    if (!targetUrl) return res.status(400).send('URL required.');

    try {
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;
        headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: headers,
            data: req.body,
            responseType: 'text',
            validateStatus: () => true
        });

        const contentType = response.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            let html = response.data;
            const origin = new URL(targetUrl).origin;
            const prefix = `${req.protocol}://${req.get('host')}/proxy?url=`;

            // Rewrite relative and absolute links to route back through this server
            html = html.replace(/(src|href|action)=["'](?!\/\/|https?:\/\/)([^"']+)["']/g, (m, attr, path) => {
                const abs = path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`;
                return `${attr}="${prefix}${encodeURIComponent(abs)}"`;
            });

            // Rewrite fully qualified external links
            html = html.replace(/(src|href|action)=["'](https?:\/\/|\/\/)([^"']+)["']/g, (m, attr, proto, path) => {
                const abs = proto === '//' ? `https://${path}` : `${proto}${path}`;
                return `${attr}="${prefix}${encodeURIComponent(abs)}"`;
            });

            res.setHeader('Content-Type', 'text/html');
            return res.send(html);
        }

        res.setHeader('Content-Type', contentType);
        res.send(response.data);
    } catch (err) {
        res.status(500).send(`Routing Error: ${err.message}`);
    }
});

app.listen(PORT, () => console.log(`Gateway live on port ${PORT}`));
