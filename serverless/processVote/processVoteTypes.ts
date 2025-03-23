export interface VoteRequestBody {
    vote: string;
    poll: string;
    isOpen?: boolean;
    country?: string;
    captchaToken?: string;
    phoneNumber?: string;
    phoneToken?: string;
    email?: string;
    sessionToken?: string;
    latencyTokens?: string[];
}

export interface VoteResponseBody {
    message: string;
    time: Date;
    missingRegions?: string[]; // Optional field returned when latency tokens are missing
} 