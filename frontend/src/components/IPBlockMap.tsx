import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper } from '@mui/material';

interface IPBlockMapProps {
  votes: string[];  // Array of CSV lines: time,ip,poll,vote,country,nonce,country_geoip,asn_name_geoip
  options: string[];
}

interface BlockData {
  total: number;
  votes: { [key: string]: number };
  asns: { [key: string]: number };
  countries: { [key: string]: number };
}

const IPBlockMap: React.FC<IPBlockMapProps> = ({ votes, options }) => {
  const [selectedBlock, setSelectedBlock] = useState<{
    block: string;
    data: BlockData;
  } | null>(null);

  // Process votes into IP blocks
  const blockData = useMemo(() => {
    const blocks: { [key: string]: BlockData } = {};
    
    votes.forEach(vote => {
      const [, ip, , voteOption, , , country, asn] = vote.split(',');
      
      // Get first octet and pad with zeros
      const firstOctet = ip.split('.')[0].padStart(3, '0');
      
      if (!blocks[firstOctet]) {
        blocks[firstOctet] = {
          total: 0,
          votes: {},
          asns: {},
          countries: {}
        };
      }
      
      blocks[firstOctet].total++;
      blocks[firstOctet].votes[voteOption] = (blocks[firstOctet].votes[voteOption] || 0) + 1;
      if (asn) blocks[firstOctet].asns[asn] = (blocks[firstOctet].asns[asn] || 0) + 1;
      if (country) blocks[firstOctet].countries[country] = (blocks[firstOctet].countries[country] || 0) + 1;
    });

    return blocks;
  }, [votes]);

  // Find maximum votes for scaling
  const maxVotes = Math.max(...Object.values(blockData).map(data => data.total));

  // Calculate color for a block
  const getBlockColor = (data: BlockData) => {
    if (!data || data.total === 0) {
      return 'rgba(128, 128, 128, 0.1)';
    }

    const option1Votes = data.votes[options[0]] || 0;
    const ratio = option1Votes / data.total;
    const opacity = (data.total / maxVotes) * 0.8 + 0.2;

    if (ratio > 0.5) {
      return `rgba(0, 0, 255, ${opacity})`;
    } else if (ratio < 0.5) {
      return `rgba(255, 0, 0, ${opacity})`;
    } else {
      return `rgba(128, 0, 128, ${opacity})`;
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Votes by IPv4 Block
      </Typography>
      <Typography variant="body2" gutterBottom>
        Each square represents a /8 IP block (first octet). Color intensity indicates number of votes,
        color indicates majority vote in that block.
      </Typography>

      {/* Block info display - Moved above the grid */}
      <Paper 
        elevation={3}
        sx={{ 
          p: 2, 
          mb: 2, // Changed from mt to mb
          height: '160px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          overflow: 'auto'
        }}
      >
        {selectedBlock ? (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              IP Block: {selectedBlock.block}.0.0.0/8
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total votes: {selectedBlock.data.total}
            </Typography>
            {Object.entries(selectedBlock.data.votes).map(([option, count]) => (
              <Typography 
                key={option} 
                variant="body2" 
                color="text.secondary"
              >
                {option}: {count} ({((count / selectedBlock.data.total) * 100).toFixed(1)}%)
              </Typography>
            ))}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Countries: {Object.keys(selectedBlock.data.countries).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ASNs: {Object.keys(selectedBlock.data.asns).length}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <Typography variant="body2" color="text.secondary">
              Hover over an IPv4 block to see voting details
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Grid container */}
      <Box sx={{ 
        maxWidth: '600px',  // Add max width
        margin: '0 auto',   // Center the container
        display: 'grid',
        gridTemplateColumns: 'repeat(16, 1fr)',
        gap: 0.5,
        border: '1px solid #ddd',
        borderRadius: 1,
        p: 1,
        backgroundColor: '#f5f5f5'
      }}>
        {Array.from({ length: 256 }, (_, i) => {
          const block = i.toString().padStart(3, '0');
          const data = blockData[block] || { total: 0, votes: {}, asns: {}, countries: {} };
          
          return (
            <Box
              key={block}
              sx={{
                aspectRatio: '1',
                backgroundColor: getBlockColor(data),
                border: '1px solid #ddd',
                borderRadius: 0.5,
                cursor: 'pointer',
                '&:hover': {
                  border: '1px solid #000',
                  transform: 'scale(1.1)',
                  zIndex: 1,
                }
              }}
              onMouseEnter={() => setSelectedBlock({ block, data })}
              onMouseLeave={() => setSelectedBlock(null)}
            />
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Typography variant="caption" sx={{ color: 'rgb(0, 0, 255)' }}>
          {options[0]} majority
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgb(255, 0, 0)' }}>
          {options[1]} majority
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgb(128, 128, 128)' }}>
          No data
        </Typography>
      </Box>
    </Box>
  );
};

export default IPBlockMap; 