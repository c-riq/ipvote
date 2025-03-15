/**
 * Normalizes text by removing diacritics and converting to lowercase
 * @param {string} text - The text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
    return text.normalize('NFKD')            // Decompose characters into base + diacritic
             .replace(/[\u0300-\u036f]/g, '') // Remove diacritic marks
             .toLowerCase();
}

module.exports = { normalizeText }; 