import React, { useState, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import InfoBox from './InfoBox';

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
      
      // Skip if IP is undefined or malformed
      if (!ip || !ip.includes('.')) return;
      
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

  // Calculate block-level majority votes for /8 blocks
  const block8MajorityVotes = useMemo(() => {
    return Object.entries(blockData).reduce((acc, [_, data]) => {
      const winner = Object.entries(data.votes).reduce((max, [option, count]) => 
        count > (data.votes[max] || 0) ? option : max
      , Object.keys(data.votes)[0])
      
      if (winner) {
        acc[winner] = (acc[winner] || 0) + 1
      }
      return acc
    }, {} as { [key: string]: number })
  }, [blockData])

  // Calculate block-level majority votes for /16 blocks
  const block16Data = useMemo(() => {
    const blocks: { [key: string]: BlockData } = {};
    
    votes.forEach(vote => {
      const [, ip, , voteOption, , , country, asn] = vote.split(',');
      
      // Skip if IP is undefined or malformed
      if (!ip || !ip.includes('.')) return;
      
      const [first, second] = ip.split('.');
      // Skip if first or second octet is missing
      if (!first || !second) return;
      
      const block16 = `${first.padStart(3, '0')}.${second.padStart(3, '0')}`;
      
      if (!blocks[block16]) {
        blocks[block16] = {
          total: 0,
          votes: {},
          asns: {},
          countries: {}
        };
      }
      
      blocks[block16].total++;
      blocks[block16].votes[voteOption] = (blocks[block16].votes[voteOption] || 0) + 1;
      if (asn) blocks[block16].asns[asn] = (blocks[block16].asns[asn] || 0) + 1;
      if (country) blocks[block16].countries[country] = (blocks[block16].countries[country] || 0) + 1;
    });

    return blocks;
  }, [votes]);

  const block16MajorityVotes = useMemo(() => {
    return Object.entries(block16Data).reduce((acc, [_, data]) => {
      const winner = Object.entries(data.votes).reduce((max, [option, count]) => 
        count > (data.votes[max] || 0) ? option : max
      , Object.keys(data.votes)[0])
      
      if (winner) {
        acc[winner] = (acc[winner] || 0) + 1
      }
      return acc
    }, {} as { [key: string]: number })
  }, [block16Data])

  const renderBlockStats = (
    title: string,
    majorityVotes: { [key: string]: number },
    description: string
  ) => {
    const totalBlocks = Object.values(majorityVotes).reduce((a, b) => a + b, 0)
    const colors = ['#4169E1', '#ff6969']  // Royal Blue and Crimson

    return (
      <Box sx={{ 
        mt: 2, 
        p: 2, 
        bgcolor: 'background.paper',
        borderRadius: 1,
        boxShadow: 1
      }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {description}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          gap: 4,
          alignItems: 'center',
          mt: 1
        }}>
          {options.map((option, i) => (
            <Box key={option} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 16, 
                height: 16, 
                bgcolor: colors[i],
                borderRadius: '50%'
              }} />
              <Typography>
                {option}: {majorityVotes[option] || 0} blocks
                {' '}
                ({totalBlocks ? ((majorityVotes[option] || 0) / totalBlocks * 100).toFixed(1) : 0}%)
              </Typography>
            </Box>
          ))}
          <Typography color="text.secondary">
            Total blocks: {totalBlocks}
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Votes by IPv4 Block
      </Typography>
      <Typography variant="body2" gutterBottom>
        Each square represents a /8 IP block (first octet). Color intensity indicates number of votes,
        color indicates majority vote in that block. <br />
        An uneven distribution of responses across blocks may indicate manipulation attempts.
      </Typography>

      <InfoBox
        selected={selectedBlock ? {
          title: `IP Block: ${selectedBlock.block}.0.0.0/8`,
          total: selectedBlock.data.total,
          votes: selectedBlock.data.votes,
          extraInfo: {
            Countries: Object.keys(selectedBlock.data.countries).length,
            ASNs: Object.keys(selectedBlock.data.asns).length
          }
        } : undefined}
        placeholder="Hover over an IPv4 block to see voting details"
      />

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

      {renderBlockStats(
        "IPv4 /8 Block-level Vote Results",
        block8MajorityVotes,
        "Each /8 block (first octet) gets one vote based on the majority preference of its users."
      )}

      {renderBlockStats(
        "IPv4 /16 Block-level Vote Results",
        block16MajorityVotes,
        "Each /16 block (first two octets) gets one vote based on the majority preference of its users."
      )}
    </Box>
  );
};

export default IPBlockMap; 