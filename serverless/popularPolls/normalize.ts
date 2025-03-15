function normalizeText(text: string): string {
    return text.normalize('NFKD')            // Decompose characters into base + diacritic
             .replace(/[\u0300-\u036f]/g, '') // Remove diacritic marks
             .toLowerCase();
}

export { normalizeText }; 