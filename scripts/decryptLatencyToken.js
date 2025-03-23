const crypto = require('crypto');
const fs = require('fs');

// Read and parse ENCRYPTION_KEY from .env file
const envFile = fs.readFileSync('./serverless/triangulation/.env', 'utf8');
const encryptionKeyMatch = envFile.match(/ENCRYPTION_KEY=(.+)/);
if (!encryptionKeyMatch) {
    throw new Error('ENCRYPTION_KEY not found in .env file');
}

// Convert the key to exactly 32 bytes using SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256')
    .update(encryptionKeyMatch[1])
    .digest();

function decrypt(encryptedToken) {
    console.log('Input token:', encryptedToken);
    
    const parts = encryptedToken.split(';');
    console.log('Token parts:', parts);
    
    if (parts.length < 3) {
        throw new Error('Invalid token format. Expected format: region;ivHex;encryptedHex');
    }
    
    const [_region, ivHex, encryptedHex] = parts;
    
    if (!ivHex || !encryptedHex) {
        throw new Error('Missing IV or encrypted data');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
}

// Usage: node decryptLatencyToken.js "token_here"
const token = process.argv[2];
if (!token) {
    console.error('Please provide a token as command line argument');
    process.exit(1);
}

try {
    const decrypted = decrypt(token);
    console.log('Decrypted:', decrypted);
} catch (error) {
    console.error('Decryption failed:', error);
} 