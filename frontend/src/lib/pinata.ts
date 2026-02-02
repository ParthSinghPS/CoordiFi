/**
 * Pinata IPFS Client
 * 
 * Upload files to IPFS via Pinata for decentralized storage.
 * Used for proof files, documents, and images.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

export interface UploadResult {
    success: boolean;
    cid?: string;
    url?: string;
    error?: string;
}

/**
 * Upload a file to IPFS via Pinata
 */
export async function uploadToIPFS(file: File, name?: string): Promise<UploadResult> {
    if (!PINATA_JWT) {
        console.error('[Pinata] JWT not configured');
        return { success: false, error: 'Pinata JWT not configured' };
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Add metadata
        const metadata = JSON.stringify({
            name: name || file.name,
            keyvalues: {
                app: 'coordination-protocol',
                timestamp: new Date().toISOString(),
            }
        });
        formData.append('pinataMetadata', metadata);

        // Pin options
        const options = JSON.stringify({
            cidVersion: 1,
        });
        formData.append('pinataOptions', options);

        console.log('[Pinata] Uploading file:', file.name);

        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Pinata] Upload failed:', error);
            return { success: false, error: `Upload failed: ${response.status}` };
        }

        const data = await response.json();
        const cid = data.IpfsHash;
        const url = `${PINATA_GATEWAY}/${cid}`;

        console.log('[Pinata] ✅ Uploaded:', url);

        return {
            success: true,
            cid,
            url,
        };
    } catch (err: any) {
        console.error('[Pinata] Error:', err);
        return { success: false, error: err.message || 'Upload failed' };
    }
}

/**
 * Upload JSON data to IPFS
 */
export async function uploadJSONToIPFS(data: object, name?: string): Promise<UploadResult> {
    if (!PINATA_JWT) {
        return { success: false, error: 'Pinata JWT not configured' };
    }

    try {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pinataContent: data,
                pinataMetadata: {
                    name: name || 'json-data',
                    keyvalues: {
                        app: 'coordination-protocol',
                        timestamp: new Date().toISOString(),
                    }
                },
                pinataOptions: {
                    cidVersion: 1,
                }
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Pinata] JSON upload failed:', error);
            return { success: false, error: `Upload failed: ${response.status}` };
        }

        const result = await response.json();
        const cid = result.IpfsHash;
        const url = `${PINATA_GATEWAY}/${cid}`;

        console.log('[Pinata] ✅ JSON uploaded:', url);

        return {
            success: true,
            cid,
            url,
        };
    } catch (err: any) {
        console.error('[Pinata] Error:', err);
        return { success: false, error: err.message || 'Upload failed' };
    }
}

/**
 * Get IPFS URL from CID
 */
export function getIPFSUrl(cid: string): string {
    return `${PINATA_GATEWAY}/${cid}`;
}

/**
 * Validate that a URL is an IPFS URL
 */
export function isIPFSUrl(url: string): boolean {
    return url.includes('ipfs') || url.startsWith('ipfs://');
}

/**
 * Convert ipfs:// URL to gateway URL
 */
export function resolveIPFSUrl(url: string): string {
    if (url.startsWith('ipfs://')) {
        const cid = url.replace('ipfs://', '');
        return getIPFSUrl(cid);
    }
    return url;
}

/**
 * Test Pinata connection
 */
export async function testPinataConnection(): Promise<boolean> {
    if (!PINATA_JWT) {
        console.error('[Pinata] JWT not configured');
        return false;
    }

    try {
        const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
            },
        });

        if (response.ok) {
            console.log('[Pinata] ✅ Connected successfully');
            return true;
        }

        console.error('[Pinata] Authentication failed');
        return false;
    } catch (err) {
        console.error('[Pinata] Connection error:', err);
        return false;
    }
}

/**
 * Unpin/delete content from Pinata by CID
 */
export async function unpinFromIPFS(cid: string): Promise<boolean> {
    if (!PINATA_JWT) {
        console.error('[Pinata] JWT not configured');
        return false;
    }

    if (!cid) {
        console.warn('[Pinata] No CID provided for unpin');
        return false;
    }

    try {
        console.log('[Pinata] Unpinning CID:', cid);
        const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
            },
        });

        if (response.ok) {
            console.log('[Pinata] ✅ Unpinned:', cid);
            return true;
        }

        // 404 means already unpinned - not an error
        if (response.status === 404) {
            console.log('[Pinata] CID already unpinned:', cid);
            return true;
        }

        const error = await response.text();
        console.error('[Pinata] Unpin failed:', error);
        return false;
    } catch (err) {
        console.error('[Pinata] Unpin error:', err);
        return false;
    }
}
