import fs from 'fs';
import {type Client, MessageMedia} from 'whatsapp-web.js';
import {exec} from 'child_process';

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
        const videoBuffer = fs.readFileSync(`${outputFilePath}`);
        const videoBase64 = videoBuffer.toString('base64');
        // Media objesi oluştur
        const media = MessageMedia.fromFilePath(`./${outputFilePath}`)

        // Mesajı gönder
        await client.sendMessage(chatId, media, {media});

        // Geçici mp4 dosyasını sil
        fs.unlinkSync(outputFilePath);

        console.log('Video başarıyla gönderildi.');
    } catch (error) {
        console.error('Video gönderme hatası:', error);
    }
}