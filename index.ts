import qrcode from 'qrcode-terminal';
import {Client, LocalAuth} from 'whatsapp-web.js';
import {logMessage, onMessage} from "./utils";


let lastLink = ''
const client = new Client({

    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox'],
        // executablePath: "C:\\Users\\Mirafgan\\PhpstormProjects\\WhatsappMediaDownloaderBot\\chrome\\win64-139.0.7258.154\\chrome-win64\\chrome.exe",
        executablePath: "/home/miri/WhatsappMediaDownloaderBot/chrome/linux-138.0.7204.184/chrome-linux64/chrome"
        // executablePath: "/usr/bin/google-chrome"
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});


client.on("message", async message => {
    if (message.fromMe) return;
    if (message.body.startsWith("https") && (message.body.includes("tiktok") || message.body.includes("instagram")))
        lastLink = message.body;
    await onMessage(client, message)
});


client.on('ready', async () => {
    console.log('WhatsApp Bot Hazır!');
    const chats = await client.getChats();
    const onlyPrivateChats = chats.filter(chat => !chat.isGroup && chat.unreadCount > 0)
    for (const chat of onlyPrivateChats) {
        const messages = await chat.fetchMessages({limit: chat.unreadCount, fromMe: false});
        if (messages.length > 0) {
            for (const message of messages) {
                if (message.body.startsWith("https") && (message.body.includes("tiktok") || message.body.includes("instagram")))
                    lastLink = message.body;
                await onMessage(client, message);
            }
        }
    }
    console.log("Ready Bitdi")
});
client.on('message_create', async message => {
    if (message.fromMe && lastLink) {
        const contact = await message.getContact();
        logMessage(`${contact.name || contact.pushname || contact.number} - Platform: ${lastLink.includes("tiktok") ? "TIKTOK" : "INSTAGRAM"} - URL: ${lastLink} `)
        lastLink = ''
    }
})

client.initialize();





