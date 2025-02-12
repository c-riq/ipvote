import React, { useState, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import InfoBox from './InfoBox';

interface IPBlockMapProps {
  /** Object mapping CSV headers to cell values for each vote 
   * Required fields: ip, vote
   * Optional fields: country, asn_name_geoip
   */
  votes: Array<{
    ip: string;
    vote: string;
    country?: string;
    asn_name_geoip?: string;
  }>;
  /** Array of voting options (e.g. ['Yes', 'No']) */
  options: string[];
}

interface BlockData {
  total: number;
  votes: { [key: string]: number };
  asns: { [key: string]: number };
  countries: { [key: string]: number };
}

// Add the same color generation utility function
const generateColor = (index: number, totalOptions: number) => {
  if (totalOptions === 2) {
    return index === 0 ? '#4169E1' : '#ff6969';
  }
  
  const goldenRatio = 0.618033988749895;
  const hue = (index * goldenRatio * 360) % 360;
  const saturation = 70 + (index % 3) * 10;
  const lightness = 45 + (index % 3) * 5;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const IPBlockMap: React.FC<IPBlockMapProps> = ({ votes, options }) => {
  const [selectedBlock, setSelectedBlock] = useState<{
    block: string;
    data: BlockData;
  } | null>(null);

  // Process votes into IP blocks
  const blockData = useMemo(() => {
    const blocks: { [key: string]: BlockData } = {};
    
    votes.forEach(vote => {
      const { ip, vote: voteOption, country, asn_name_geoip: asn } = vote;
      
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

    const opacity = (data.total / maxVotes) * 0.8 + 0.2;
    const winningOption = Object.entries(data.votes).reduce((max, [option, count]) => 
      count > (data.votes[max] || 0) ? option : max
    , Object.keys(data.votes)[0]);

    const optionIndex = options.indexOf(winningOption);
    if (options.length === 2) {
      return `rgba(${optionIndex === 0 ? '65, 105, 225' : '255, 105, 105'}, ${opacity})`;
    }
    
    const baseColor = generateColor(optionIndex, options.length);
    return baseColor.replace('hsl', 'hsla').replace(')', `, ${opacity})`);
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
      const { ip, vote: voteOption, country, asn_name_geoip: asn } = vote;
      
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
    majorityVotes: { [key: string]: number } | undefined,
    description: string
  ) => {
    const totalBlocks = majorityVotes ? Object.values(majorityVotes).reduce((a, b) => a + b, 0) : 0
    
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
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: { sm: 'space-between' },
          gap: { xs: 1, sm: 2 }
        }}>
          <Box sx={{ 
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: options.length === 2 ? 'repeat(2, auto)' : 'repeat(auto-fill, minmax(150px, 1fr))' },
            gap: 2
          }}>
            {options.map((option, i) => (
              <Box key={option} sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                minWidth: 0
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  flexShrink: 0,
                  bgcolor: generateColor(i, options.length),
                  borderRadius: '50%'
                }} />
                <Typography noWrap>
                  {option}: {(majorityVotes?.[option] || 0)} blocks
                  {' '}
                  ({totalBlocks ? ((majorityVotes?.[option] || 0) / totalBlocks * 100).toFixed(1) : 0}%)
                </Typography>
              </Box>
            ))}
          </Box>
          
          <Typography 
            color="text.secondary"
            sx={{ 
              borderLeft: { sm: 1 },
              borderColor: { sm: 'divider' },
              pl: { sm: 2 }
            }}
          >
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

      {/* Updated legend */}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        {options.map((option, index) => (
          <Typography 
            key={option} 
            variant="caption" 
            sx={{ color: generateColor(index, options.length) }}
          >
            {option} majority
          </Typography>
        ))}
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