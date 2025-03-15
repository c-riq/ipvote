import { useState, useEffect } from 'react';
import { RECENT_VOTES_FILE } from '../../constants';

interface RecentVote {
  poll: string;
  vote: string;
  timestamp: number;
  ip: string;
  country: string;
}

interface RecentVotesProps {
  onPollClick: (poll: string, event: React.MouseEvent) => void;
}

function RecentVotes({ onPollClick }: RecentVotesProps) {
  const [recentVotes, setRecentVotes] = useState<RecentVote[]>([]);

  const fetchRecentVotes = async () => {
    try {
      const response = await fetch(RECENT_VOTES_FILE);
      const data = await response.json();
      setRecentVotes(data.votes);
    } catch (error) {
      console.error('Error fetching recent votes:', error);
    }
  };

  useEffect(() => {
    fetchRecentVotes();
    const interval = setInterval(fetchRecentVotes, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCountryFlag = (countryCode: string) => {
    return countryCode
      ? countryCode
          .toUpperCase()
          .replace(/./g, char => 
            String.fromCodePoint(char.charCodeAt(0) + 127397)
          )
      : '';
  };

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      padding: '10px',
      borderRadius: '8px',
      marginBottom: '20px',
      maxHeight: '200px',
      overflow: 'auto',
      maxWidth: '500px'
    }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Recent Votes</h4>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '4px'
      }}>
        {recentVotes.slice(0, 80).map((vote, index) => {
          const voteDate = new Date(vote.timestamp);
          const today = new Date();
          let timeDisplay;
          
          if (voteDate.toDateString() === today.toDateString()) {
            timeDisplay = voteDate.toLocaleTimeString();
          } else if (
            voteDate.toDateString() === new Date(today.setDate(today.getDate() - 1)).toDateString()
          ) {
            timeDisplay = `Yesterday ${voteDate.toLocaleTimeString()}`;
          } else {
            timeDisplay = voteDate.toLocaleDateString() + ' ' + voteDate.toLocaleTimeString();
          }
          
          return (
            <div key={index} style={{ 
              fontSize: '12px',
              display: 'grid',
              gridTemplateColumns: '100px minmax(100px, 1.5fr) minmax(60px, 1fr) 100px',
              gap: '8px',
              alignItems: 'center',
              padding: '4px 0'
            }}>
              <span style={{ 
                color: '#666',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {timeDisplay}
              </span>
              <span 
                style={{ 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  color: '#1976d2',
                  textDecoration: 'underline',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onClick={(e) => onPollClick(vote.poll, e)}
              >
                {vote.poll.replace(/^open_/, '').replace(/%2C/g, ',')}
              </span>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {vote.vote}
              </span>
              <span style={{ 
                color: '#666',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {getCountryFlag(vote.country)} {vote.country}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RecentVotes; 