import { getCurrentUser } from "./authService";

export interface ImageProofMetadata {
    prompt?: string;
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    inputImagesCount?: number;
    createdAt?: number | string;
    authorId?: string;
    authorName?: string;
    copyrightNotice?: string;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const computeCrc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const writeUint32BE = (value: number): Uint8Array => {
    const out = new Uint8Array(4);
    out[0] = (value >>> 24) & 0xff;
    out[1] = (value >>> 16) & 0xff;
    out[2] = (value >>> 8) & 0xff;
    out[3] = value & 0xff;
    return out;
};

const readUint32BE = (arr: Uint8Array, offset: number): number => {
    return ((arr[offset] << 24) >>> 0) + ((arr[offset + 1] << 16) >>> 0) + ((arr[offset + 2] << 8) >>> 0) + (arr[offset + 3] >>> 0);
};

const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
    const total = chunks.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of chunks) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
};

const createPngChunk = (chunkType: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(chunkType);
    const crcInput = concatUint8Arrays([typeBytes, data]);
    const crc = computeCrc32(crcInput);
    return concatUint8Arrays([
        writeUint32BE(data.length),
        typeBytes,
        data,
        writeUint32BE(crc)
    ]);
};

const dataUrlToBytes = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
        throw new Error('Invalid base64 image data URL format.');
    }
    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return { mimeType, bytes };
};

const looksLikePng = (bytes: Uint8Array): boolean => {
    if (bytes.length < PNG_SIGNATURE.length) return false;
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) return false;
    }
    return true;
};

const embedPngMetadata = (pngBytes: Uint8Array, keyword: string, text: string): Uint8Array | null => {
    try {
        if (!looksLikePng(pngBytes)) return null;

        let iendOffset = -1;
        let offset = 8;

        while (offset + 12 <= pngBytes.length) {
            const length = readUint32BE(pngBytes, offset);
            const typeStart = offset + 4;
            const type = String.fromCharCode(
                pngBytes[typeStart],
                pngBytes[typeStart + 1],
                pngBytes[typeStart + 2],
                pngBytes[typeStart + 3]
            );

            if (type === 'IEND') {
                iendOffset = offset;
                break;
            }

            const nextOffset = offset + 12 + length;
            if (nextOffset <= offset || nextOffset > pngBytes.length) {
                return null;
            }
            offset = nextOffset;
        }

        if (iendOffset < 0) return null;

        const keywordBytes = new TextEncoder().encode(keyword);
        const textBytes = new TextEncoder().encode(text);

        const iTXtData = concatUint8Arrays([
            keywordBytes,
            new Uint8Array([0]),
            new Uint8Array([0]),
            new Uint8Array([0]),
            new Uint8Array([0]),
            textBytes
        ]);

        const chunk = createPngChunk('iTXt', iTXtData);
        const before = pngBytes.slice(0, iendOffset);
        const after = pngBytes.slice(iendOffset);
        return concatUint8Arrays([before, chunk, after]);
    } catch {
        return null;
    }
};

const bufferToHex = (buffer: ArrayBuffer): string => {
    const arr = new Uint8Array(buffer);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return bufferToHex(hash);
};

const getOrCreateLocalProofSecret = (): string => {
    const key = 'wite_ai_local_proof_secret';
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const secret = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, secret);
    return secret;
};

const signLocalProof = async (secret: string, payload: string): Promise<string> => {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return bufferToHex(signature);
};

const triggerDownloadFromBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

const triggerDataUrlDownload = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const toIsoUtc = (value?: number | string): string => {
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
};

export const downloadBase64ImageWithProof = async (
    base64Data: string,
    filename: string,
    metadata?: ImageProofMetadata
) => {
    try {
        const { mimeType, bytes } = dataUrlToBytes(base64Data);

        if (mimeType !== 'image/png' || !looksLikePng(bytes)) {
            triggerDataUrlDownload(base64Data, filename);
            return;
        }

        const user = getCurrentUser();
        const createdAtUtc = toIsoUtc(metadata?.createdAt);
        const workId = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        const imageSha256 = await sha256Hex(bytes);
        const promptHash = metadata?.prompt ? await sha256Hex(new TextEncoder().encode(metadata.prompt)) : undefined;

        const provenance: Record<string, any> = {
            schema: 'wite.provenance.v1',
            workId,
            createdAtUtc,
            downloadedAtUtc: new Date().toISOString(),
            imageSha256,
            promptHash: promptHash || null,
            model: metadata?.model || null,
            resolution: metadata?.resolution || null,
            aspectRatio: metadata?.aspectRatio || null,
            inputImagesCount: metadata?.inputImagesCount ?? null,
            authorId: metadata?.authorId || user?.id || null,
            authorName: metadata?.authorName || user?.username || null,
            copyrightNotice: metadata?.copyrightNotice || null,
            app: 'gemini_api',
            fileName: filename
        };

        const canonical = JSON.stringify(provenance);
        const localSecret = getOrCreateLocalProofSecret();
        provenance.localProofSignature = await signLocalProof(localSecret, canonical);

        const enriched = embedPngMetadata(bytes, 'wite.provenance', JSON.stringify(provenance));
        const finalBytes = enriched || bytes;
        triggerDownloadFromBlob(new Blob([finalBytes], { type: 'image/png' }), filename);
    } catch (error) {
        console.warn('Failed to embed PNG metadata, downloading original image:', error);
        triggerDataUrlDownload(base64Data, filename);
    }
};
