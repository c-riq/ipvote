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
  height = '160px', 
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
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            {selected.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total votes: {selected.total}
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
          {selected.extraInfo && Object.entries(selected.extraInfo).map(([label, value]) => (
            <Typography 
              key={label} 
              variant="body2" 
              color="text.secondary" 
              sx={{ mt: label === Object.keys(selected.extraInfo!)[0] ? 1 : 0 }}
            >
              {label}: {value}
            </Typography>
          ))}
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