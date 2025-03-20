import { createDecipheriv } from 'crypto';

export interface LatencyData {
    region: string;
    latency: number;
}

export const decryptLatencyToken = (
    encryptedToken: string, 
    key: Buffer, 
    expectedIp: string
): LatencyData | null => {
    try {
        const [region, encryptedData] = encryptedToken.split(';');
        const [ivHex, encryptedHex] = encryptedData.split(';');
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        
        const decipher = createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        const [timestamp1, timestamp2, tokenIp] = decrypted.toString().split(';');
        
        // Verify IP matches
        if (tokenIp !== expectedIp) {
            console.warn('IP mismatch in latency token:', { tokenIp, expectedIp });
            return null;
        }
        
        // Calculate latency
        const latency = (parseInt(timestamp2) - parseInt(timestamp1)) / 2;
        return { region, latency };
    } catch (error) {
        console.error('Error processing latency token:', error);
        return null;
    }
}; 