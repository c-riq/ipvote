const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
    input: fs.createReadStream('votes.csv'),
    crlfDelay: Infinity
});

// Store file handles for each partition
const fileHandles = new Map();
let isFirstLine = true;
let headers = '';

// Process each line
rl.on('line', (line) => {
    // Save headers and skip first line
    if (isFirstLine) {
        headers = line;
        isFirstLine = false;
        return;
    }

    // Parse IP address from the CSV line
    const columns = line.split(',');
    const ip = columns[1];
    
    let ipPrefix;
    if (ip.includes(':')) {
        ipPrefix = ip.split(':')[0].padStart(4, '0').slice(0, 2);
    } else {
        ipPrefix = ip.split('.')[0].padStart(3, '0').slice(0, 2);
    }
    ipPrefix = 'ip_prefix=' + ipPrefix;

    // Create directory if it doesn't exist
    const resultDir = path.join(__dirname, 'result');
    if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true });
    }
    const dirPath = path.join(resultDir, ipPrefix);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // Get or create file handle for this partition
    if (!fileHandles.has(ipPrefix)) {
        const filePath = path.join(dirPath, 'votes.csv');
        const fileHandle = fs.createWriteStream(filePath);
        fileHandle.write(headers + '\n'); // Write headers
        fileHandles.set(ipPrefix, fileHandle);
    }

    // Write the line to appropriate partition file
    fileHandles.get(ipPrefix).write(line + '\n');
});

// Clean up file handles when done
rl.on('close', () => {
    for (const handle of fileHandles.values()) {
        handle.end();
    }
    console.log('Finished partitioning files');
}); 