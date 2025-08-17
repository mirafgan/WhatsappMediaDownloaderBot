import {spawn} from "child_process"

function cleanBase64(base64String: string): string {
    // Tüm data URL prefix'lerini temizle
    const cleaned = base64String
        .replace(/^data:video\/[^;]+;base64,/, "")
        .replace(/^data:application\/[^;]+;base64,/, "")
        .replace(/^data:[^;]+;base64,/, "")
        .replace(/\s/g, "") // Tüm boşlukları kaldır
        .trim()

    return cleaned
}

function validateBase64(base64String: string): boolean {
    // Base64 formatını kontrol et
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    return base64Regex.test(base64String) && base64String.length % 4 === 0
}

async function base64ToMp4Buffer(base64: string, timeoutMs = 60000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const cleaned = cleanBase64(base64)

        // Base64 formatını doğrula
        if (!validateBase64(cleaned)) {
            return reject(new Error("Geçersiz base64 formatı!"))
        }

        console.log("Temizlenmiş base64 uzunluğu:", cleaned.length)

        let inputBuffer: Buffer
        try {
            inputBuffer = Buffer.from(cleaned, "base64")
        } catch (error) {
            return reject(new Error("Base64 decode hatası: " + error?.message ?? 'Unknown error'))
        }

        console.log("Video buffer boyutu:", inputBuffer.length, "byte")

        // Minimum dosya boyutu kontrolü (500 bytes - daha esnek)
        if (inputBuffer.length < 500) {
            return reject(new Error("Video verisi çok küçük (minimum 500 byte gerekli)"))
        }

        const header = inputBuffer.subarray(0, 20)
        const headerHex = header.toString("hex")
        const headerString = header.toString()

        console.log("Video header (hex):", headerHex.substring(0, 32))
        console.log("Video header (string):", headerString.substring(0, 16))

        // Daha esnek format kontrolü - sadece uyarı ver, reddetme
        const commonVideoSignatures = ["ftyp", "moov", "mdat", "free", "skip", "wide", "pnot", "uuid"]

        const hasVideoSignature = commonVideoSignatures.some(
            (sig) => headerString.includes(sig) || headerHex.includes(Buffer.from(sig).toString("hex")),
        )

        if (!hasVideoSignature) {
            console.warn("Uyarı: Tanınmayan video formatı, yine de dönüştürme deneniyor...")
        }

        const ffmpeg = spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error", // Sadece hataları göster
            "-analyzeduration",
            "10000000", // Daha uzun analiz süresi
            "-probesize",
            "10000000", // Daha büyük probe boyutu
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-preset",
            "ultrafast", // En hızlı encoding
            "-crf",
            "28", // Daha hızlı için kaliteyi düşür
            "-movflags",
            "+faststart+frag_keyframe+empty_moov",
            "-avoid_negative_ts",
            "make_zero", // Timestamp sorunlarını çöz
            "-fflags",
            "+genpts", // Timestamp oluştur
            "-f",
            "mp4",
            "pipe:1",
        ])

        const chunks: Buffer[] = []
        let errorOutput = ""
        let isResolved = false

        // Timeout
        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.log("FFmpeg timeout, process sonlandırılıyor...")
                ffmpeg.kill("SIGKILL")
                reject(new Error(`FFmpeg timeout (${timeoutMs}ms)`))
            }
        }, timeoutMs)

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            chunks.push(chunk)
            console.log(`FFmpeg output chunk: ${chunk.length} bytes`)
        })

        ffmpeg.stderr.on("data", (data: Buffer) => {
            const errorText = data.toString()
            errorOutput += errorText
            console.log("FFmpeg stderr:", errorText)
        })

        ffmpeg.on("error", (err) => {
            if (!isResolved) {
                isResolved = true
                clearTimeout(timeout)
                console.error("FFmpeg process error:", err)
                reject(new Error(`FFmpeg process error: ${err.message}`))
            }
        })

        ffmpeg.on("close", (code) => {
            if (!isResolved) {
                isResolved = true
                clearTimeout(timeout)

                console.log(`FFmpeg process closed with code: ${code}`)
                console.log(`Total output chunks: ${chunks.length}`)

                if (code === 0 && chunks.length > 0) {
                    const result = Buffer.concat(chunks)
                    console.log("Başarılı! Çıktı video boyutu:", result.length, "byte")
                    resolve(result)
                } else {
                    console.error("FFmpeg failed. Full stderr:", errorOutput)
                    reject(new Error(`FFmpeg failed (code: ${code}). Error: ${errorOutput || "No error output"}`))
                }
            }
        })

        try {
            console.log("FFmpeg'e input gönderiliyor...")
            ffmpeg.stdin.write(inputBuffer)
            ffmpeg.stdin.end()
            console.log("Input gönderimi tamamlandı")
        } catch (error) {
            if (!isResolved) {
                isResolved = true
                clearTimeout(timeout)
                console.error("Input write error:", error)
                reject(new Error(`Input write error: ${error?.message ?? 'Unknown error'}`))
            }
        }
    })
}

export {base64ToMp4Buffer, cleanBase64, validateBase64}
