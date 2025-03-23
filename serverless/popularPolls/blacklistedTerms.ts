
export const BLACKLISTED_TERMS = [
    'pedophile',
    'gay',
    'kill',
    'murder',
    'die',
    'faggot',
    'stupid',
    'retard',
    'sex',
    'porn',
    'dumb'
] as const;

export function ignorePoll(pollTitle: string): boolean {
    const normalizedTitle = pollTitle.toLowerCase().replace(/_/g, ' ');
    
    const sensitivePatterns = BLACKLISTED_TERMS.map(term => 
        new RegExp(`\\b${term}\\b`, 'i')
    );
    
    return sensitivePatterns.some(pattern => pattern.test(normalizedTitle));
}
