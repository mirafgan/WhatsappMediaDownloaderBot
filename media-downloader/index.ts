import {instagramGetUrl} from "instagram-url-direct";

const Tiktok = require("@tobyg74/tiktok-api-dl")

export async function downloadFromInstagram(url: string) {
    try {
        const response = await instagramGetUrl(url)
        const data = response.url_list.map((link) => ({
            download_link: link,
            thumbnail_link: link.includes(".mp4") ? `/placeholder.svg?width=80&height=80&query=video+play+icon` : link,
        }))
        return {data}
    } catch (error) {
        console.error(error)
        return {
            error: "İnstagram videosu yüklənə bilmədi",
        }
    }
}

export async function downloadMedia(url: string) {
    if (url.includes("instagram")) {
        const {data: instaMedia, error} = await downloadFromInstagram(url.trim());
        return {media: instaMedia, error}
    } else if (url.includes("tiktok")) {
        try {
            const {result} = await Tiktok.Downloader(url.trim(), {version: "v3"});
            const media = result.images ? result.images.map((item: string) => ({
                download_link: item
            })) : [{download_link: result.videoHD}];
            return {media: Array.isArray(media) ? media : [{download_link: media}], error: ""};
        } catch (e) {
            console.log(e);
            return {media: null, error: "Tiktok videosu yüklənə bilmir"}
        }
    }
}