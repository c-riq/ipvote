import React, { useState, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import InfoBox from './InfoBox';

interface IPv6BlockMapProps {
  votes: Array<{
    ip: string;
    vote: string;
    country?: string;
    asn_name_geoip?: string;
  }>;
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

const IPv6BlockMap: React.FC<IPv6BlockMapProps> = ({ votes, options }) => {
  const [selectedBlock, setSelectedBlock] = useState<{
    block: string;
    data: BlockData;
  } | null>(null);

  // Process votes into IPv6 blocks
  const blockData = useMemo(() => {
    const blocks: { [key: string]: BlockData } = {};
    
    votes.forEach(vote => {
      const { ip, vote: voteOption, country, asn_name_geoip: asn } = vote;
      
      // Only process IPv6 addresses
      if (!ip.includes(':')) return;
      
      // Get first 28 bits (7 hex digits)
      const parts = ip.split(':');
      const firstPart = parts[0].padStart(4, '0');
      const secondPart = parts[1] ? parts[1].padStart(4, '0') : '0000';
      const firstBlock = firstPart + secondPart.slice(0, 3);
      
      if (!blocks[firstBlock]) {
        blocks[firstBlock] = {
          total: 0,
          votes: {},
          asns: {},
          countries: {}
        };
      }
      
      blocks[firstBlock].total++;
      blocks[firstBlock].votes[voteOption] = (blocks[firstBlock].votes[voteOption] || 0) + 1;
      if (asn) blocks[firstBlock].asns[asn] = (blocks[firstBlock].asns[asn] || 0) + 1;
      if (country) blocks[firstBlock].countries[country] = (blocks[firstBlock].countries[country] || 0) + 1;
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

  // Calculate block-level majority votes
  const blockMajorityVotes = useMemo(() => {
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

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Votes by IPv6 Block
      </Typography>
      <Typography variant="body2" gutterBottom>
        Each square represents a /28 IPv6 block (first 7 hex digits). Color intensity indicates number of votes,
        color indicates majority vote in that block. Only blocks with votes are shown.
      </Typography>

      <InfoBox
        selected={selectedBlock ? {
          title: `IPv6 Block: ${selectedBlock.block.slice(0, 4)}:${selectedBlock.block.slice(4)}0::/28`,
          total: selectedBlock.data.total,
          votes: selectedBlock.data.votes,
          extraInfo: {
            Countries: Object.keys(selectedBlock.data.countries).length,
            ASNs: Object.keys(selectedBlock.data.asns).length
          }
        } : undefined}
        placeholder="Hover over an IPv6 block to see voting details"
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
        {Object.entries(blockData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([block, data]) => (
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
          ))}
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
        "IPv6 Block-level Vote Results",
        blockMajorityVotes,
        "Each /28 IPv6 block gets one vote based on the majority preference of its users."
      )}
    </Box>
  );
};

export default IPv6BlockMap; 