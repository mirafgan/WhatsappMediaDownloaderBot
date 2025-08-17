import fs from 'fs';
import {type Client, type Message, MessageMedia} from 'whatsapp-web.js';
import {exec} from 'child_process';
import {downloadMedia} from "../media-downloader";
import path from "node:path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export function extractUrls(text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex)?.[0] || "";
}


// Base64 string'i geçerli base64 formatına indirger
function cleanBase64(base64String: string) {
    return base64String.replace(/^data:.*;base64,/, '');
}

// Base64'ü MP4 dosyasına dönüştürür (promise döner)
function base64ToMp4(base64: string, outputPath: string) {
    return new Promise((resolve, reject) => {
        const cleaned = cleanBase64(base64);
        fs.writeFileSync('temp_input', cleaned, 'base64');
        exec(`ffmpeg -f mp4 -i temp_input -vcodec libx264 -acodec aac -y ${outputPath}`, (err) => {
            fs.unlinkSync("temp_input");
            if (err) {
                reject("FFmpeg hata:" + err);
            } else {
                resolve(`Video dönüştürüldü: ${outputPath}`)
            }
        });
    });
}

export async function sendBase64VideoToWhatsApp(client: Client, chatId: string, base64Video: string) {
    try {

        const outputFilePath = `output-${Date.now()}.mp4`;
        await base64ToMp4(base64Video, outputFilePath);
        const media = MessageMedia.fromFilePath(`./${outputFilePath}`)

        // Mesajı gönder
        await client.sendMessage(chatId, media, {media});
        console.timeEnd("Tiktok video time")
        // Geçici mp4 dosyasını sil
        fs.unlinkSync(outputFilePath);

        console.log('Video başarıyla gönderildi.');
    } catch (error) {
        console.error('Video gönderme hatası:', error);
    }
}


export async function onMessage(client: Client, message: Message) {
    const url = extractUrls(message.body) || '';

    // Numara kontrolü
    let lang = "en";
    if (message.from.startsWith("994")) lang = "az";
    else if (message.from.startsWith("90")) lang = "tr";
    else if (message.from.startsWith("7")) lang = "ru";

    // Dil bazlı mesajlar
    const texts = {
        az: {
            sending: "Media göndərilir...",
            error: "Media kimi göndərilərkən xəta baş verdi. Fayl kimi göndərilir..."
        },
        tr: {
            sending: "Medya gönderiliyor...",
            error: "Medya olarak gönderilirken hata oluştu. Dosya olarak gönderiliyor..."
        },
        ru: {
            sending: "Медиа отправляется...",
            error: "Произошла ошибка при отправке медиа. Отправляю как файл..."
        },
        en: {
            sending: "Sending media...",
            error: "An error occurred while sending media. Sending as a file..."
        }
    };

    if (url.startsWith("https") && (url.includes("tiktok") || url.includes("instagram"))) {
        const startTime = Date.now();
        client.sendMessage(message.from, texts[lang].sending);
        const {media, error} = await downloadMedia(url) ?? {media: null, error: ""};
        if (media) {
            for (const item of media) {
                const file = await fetch(item.download_link);
                const contentType = file.headers.get("content-type") ?? '';
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64 = buffer.toString('base64');
                const messageMedia = new MessageMedia(contentType, base64);
                try {
                    await client.sendMessage(message.from, messageMedia, {
                        sendMediaAsHd: true,
                    });
                } catch (e) {
                    console.log(e);
                    await client.sendMessage(message.from, texts[lang].error);
                    await client.sendMessage(message.from, messageMedia, {
                        sendMediaAsHd: true,
                        sendMediaAsDocument: true,
                    });
                }
            }
            client.sendMessage(message.from, `Zaman: ${((Date.now() - startTime) / 1000).toFixed(2)}`)
        } else {
            await client.sendMessage(message.from, error ?? '');
        }
    }
}


const logFile = path.join(__dirname, 'logs.txt');

export function logMessage(message: string) {
    const time = new Date().toISOString();
    const logLine = `[${time}] ${message}\n`;

    fs.appendFile(logFile, logLine, (err) => {
        if (err) console.error('Log yazılamadı:', err);
    });
}


/**
 * TikTok video sayfasından MP4 linkini döndürür
 * @param {string} tiktokUrl - TikTok paylaşım linki
 * @returns {Promise<string>} - Direkt indirilebilir MP4 linki
 */
export async function getTikTokDirectUrl(tiktokUrl: string) {
    try {
        // 1. Sayfayı al
        const res = await fetch(tiktokUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/115.0.0.0 Safari/537.36"
            }
        });
        const html = await res.text();

        // 2. HTML içinden JSON verisini bul
        const $ = cheerio.load(html);
        const scriptTag = $('script[id="SIGI_STATE"]').html();
        if (!scriptTag) throw new Error("Video verisi bulunamadı.");

        const json = JSON.parse(scriptTag);

        // 3. JSON içinden video linkini al
        const videoData = Object.values(json.ItemModule)[0];
        if (!videoData) throw new Error("Video bilgisi bulunamadı.");

        return videoData.video.downloadAddr;
    } catch (err) {
        console.error("Hata:", err.message);
        return null;
    }
}