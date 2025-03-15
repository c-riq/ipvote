import { useState, useEffect } from 'react';
import { RECENT_VOTES_FILE } from '../../constants';

const MAX_CHARS = 80;

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
      maxWidth: '500px',
      minWidth: 0,
      width: '100%'
    }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Recent Votes</h4>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '4px',
        minWidth: 0
      }}>
        {recentVotes.slice(0, 200).map((vote, index) => {
          const voteDate = new Date(vote.timestamp);
          const today = new Date();
          let timeDisplay;
          
          if (voteDate.toDateString() === today.toDateString()) {
            timeDisplay = voteDate.toLocaleTimeString();
          } else if (
            voteDate.toDateString() === new Date(today.setDate(today.getDate() - 1)).toDateString()
          ) {
            timeDisplay = `Yesterday\n${voteDate.toLocaleTimeString()}`;
          } else {
            timeDisplay = `${voteDate.toLocaleDateString()}\n${voteDate.toLocaleTimeString()}`;
          }
          
          timeDisplay = timeDisplay.length > MAX_CHARS ? timeDisplay.slice(0, MAX_CHARS - 3) + '...' : timeDisplay;
          
          return (
            <div key={index} style={{ 
              fontSize: '12px',
              display: 'grid',
              gridTemplateColumns: 'minmax(68px, 80px) minmax(100px, 2fr) minmax(40px, 0.7fr)',
              gap: '4px',
              alignItems: 'start',
              padding: '4px 0',
              minWidth: 0,
              width: '100%'
            }}>
              <span style={{ 
                color: '#666',
                whiteSpace: 'pre-line',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: '1.2',
                textAlign: 'left',
                minWidth: 0,
                fontSize: '11px'
              }}
              title={`${timeDisplay} - ${vote.country}`}>
                {getCountryFlag(vote.country)} {vote.country} {'\n'}{timeDisplay}
              </span>
              <span 
                style={{ 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  color: '#1976d2',
                  textDecoration: 'underline',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'left',
                  minWidth: 0
                }}
                onClick={(e) => onPollClick(vote.poll, e)}
                title={vote.poll.replace(/^open_/, '').replace(/%2C/g, ',')}
              >
                {(vote.poll.replace(/^open_/, '').replace(/%2C/g, ',').length > MAX_CHARS 
                  ? vote.poll.replace(/^open_/, '').replace(/%2C/g, ',').slice(0, MAX_CHARS - 3) + '...'
                  : vote.poll.replace(/^open_/, '').replace(/%2C/g, ',')
                )}
              </span>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'left',
                minWidth: 0
              }}
              title={vote.vote}>
                {vote.vote.length > MAX_CHARS * 0.6 
                  ? vote.vote.slice(0, Math.floor(MAX_CHARS * 0.6) - 3) + '...' 
                  : vote.vote}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RecentVotes; 