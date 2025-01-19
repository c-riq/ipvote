import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

interface InfoBoxProps {
  height?: string;
  selected?: {
    title: string;
    total: number;
    votes: { [key: string]: number };
    extraInfo?: { [key: string]: number };
  };
  placeholder: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ 
  height = '80px',  // Reduced default height
  selected, 
  placeholder 
}) => {
  return (
    <Paper 
      elevation={3}
      sx={{ 
        p: 2, 
        mb: 2,
        height,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        overflow: 'auto'
      }}
    >
      {selected ? (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '100%'
        }}>
          {/* Left section - Title */}
          <Box sx={{ flex: '0 0 auto', mr: 2 }}>
            <Typography variant="subtitle1">
              {selected.title}
            </Typography>
          </Box>

          {/* Middle section - Votes */}
          <Box sx={{ 
            flex: '1 1 auto',
            display: 'flex',
            gap: 2,
            justifyContent: 'center'
          }}>
            <Typography variant="body2" color="text.secondary">
              Total: {selected.total}
            </Typography>
            {Object.entries(selected.votes).map(([option, count]) => (
              <Typography 
                key={option} 
                variant="body2" 
                color="text.secondary"
              >
                {option}: {count} ({((count / selected.total) * 100).toFixed(1)}%)
              </Typography>
            ))}
          </Box>

          {/* Right section - Extra Info */}
          {selected.extraInfo && (
            <Box sx={{ 
              flex: '0 0 auto',
              ml: 2,
              display: 'flex',
              gap: 2
            }}>
              {Object.entries(selected.extraInfo).map(([label, value]) => (
                <Typography 
                  key={label} 
                  variant="body2" 
                  color="text.secondary"
                >
                  {label}: {value}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <Typography variant="body2" color="text.secondary">
            {placeholder}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default InfoBox; 