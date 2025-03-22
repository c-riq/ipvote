import { getMinLatencyTokens } from '../utils/latencyTriangulation';
import { SUBMIT_VOTE_HOST } from '../constants';
import { PhoneVerificationState } from '../App';
import { VoteRequestBody } from './processVoteTypes';

interface VoteParams {
  poll: string;
  vote: string;
  captchaToken: string;
  userIp?: string;
  phoneVerification: PhoneVerificationState | null;
  isOpen?: boolean;
}

export const submitVote = async ({
  poll,
  vote,
  captchaToken,
  userIp,
  phoneVerification,
  isOpen
}: VoteParams): Promise<{success: boolean; message: string}> => {
  const requestBody: VoteRequestBody = {
    poll,
    vote,
    captchaToken: captchaToken || '',
    isOpen
  };

  const {phoneNumber, token: phoneToken} = phoneVerification || {};
  if (phoneNumber) {
    requestBody.phoneNumber = phoneNumber;
  }
  
  if (phoneToken) {
    requestBody.phoneToken = phoneToken;
  }

  // Add email and sessionToken if available
  const email = localStorage.getItem('userEmail');
  const sessionToken = localStorage.getItem('sessionToken');
  if (email && sessionToken) {
    requestBody.email = email;
    requestBody.sessionToken = sessionToken;
  } else if (userIp) {
    const latencyTokens = await getMinLatencyTokens(userIp);
    requestBody.latencyTokens = latencyTokens.map(([region, token]) => `${region};${token}`);
  }

  const response = await fetch(`${SUBMIT_VOTE_HOST}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  const data = await response.text();
  
  return {
    success: response.status === 200,
    message: response.status === 200 ? 'Vote submitted successfully!' : JSON.parse(data)?.message || data
  };
};
