import qrcode from 'qrcode-terminal';
import {Client, LocalAuth, MessageMedia,} from 'whatsapp-web.js';
import {extractUrls} from "./utils";

import {downloadMedia} from "./media-downloader";

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: "C:\\Users\\Admin\\Desktop\\wp\\chrome\\win64-139.0.7258.66\\chrome-win64\\chrome.exe"
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on("message", async message => {
    const url = extractUrls(message.body) || '';
    if (url.startsWith("https")) {
        try {
            const {media, error} = await downloadMedia(url) ?? {media: null, error: ""};
            if (media) {
                for (const item of media) {
                    const file = await fetch(item.download_link);
                    const contentType = file.headers.get("content-type") ?? '';
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64 = buffer.toString('base64');
                    const mimeType = contentType === "application/octet-stream" ? "video/mp4" : contentType;
                    const messageMedia = new MessageMedia(mimeType, base64)
                    await client.sendMessage(message.from, messageMedia, {sendMediaAsHd: true})
                }
            } else await client.sendMessage(message.from, error ?? '');
        } catch (e) {
            console.log(e)
        }
    }
});


client.on('ready', async () => {
    console.log('WhatsApp Bot Hazır!');
});

client.initialize();





