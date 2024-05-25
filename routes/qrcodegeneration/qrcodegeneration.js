const express = require('express');
const router1 = express.Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/roleaccesssMiddleware');

// Function to generate a random key
function generateKey() {
    return uuidv4().replace(/-/g, '').slice(0, 32); // Use only the first 32 characters as the key for AES-256
}

// Function to encrypt data using AES
function encryptData(data, key) {
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// Function to decrypt data using AES
function decryptData(encryptedData, key) {
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Endpoint for generating QR code
router1.post('/generateQRCode', authMiddleware(['Admin','Teacher']), async (req, res) => {
    try {
        // Extract class details from the request body
        const { section,course, batch, branch, subjectCode, userID } = req.body;
        const link = `https://AttendXpert.com/attendance?section=${section}&batch=${batch}&branch=${branch}&subjectCode=${subjectCode}&userId=${userID}&course=${course}`;
        
        // Generate a random key for encryption
        const key = generateKey();
        const timestamp = Date.now() + 5 * 60 * 1000; // 5 minutes validity
        const falseLink = `${link}&random=${key}&timestamp=${timestamp}`;

        // Encrypt the link using AES
        const encryptedLink = encryptData(falseLink, key);
        
        const combinedData = `encrypt:${encryptedLink},key:${key}`;
        // Generate QR code for the combined data
        const qrCodeImage = await QRCode.toDataURL(combinedData);
        
        res.send({ qrCodeImage }); 
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint for decrypting the link
router1.post('/decryptLink', async (req, res) => {
    try {
        const { encryptedLink, key } = req.body; // Get encrypted link and encryption key from request body
        
        // Decrypt the link using the encryption key
        const decryptedLink = decryptData(encryptedLink, key);
        
        res.send({ decryptedLink });
    } catch (error) {
        console.error('Error decrypting link:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router1;
