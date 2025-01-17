import { Card, CardContent, Typography } from '@mui/material'

interface PollCardProps {
  name: string
  votes: number
  onClick: () => void
}

function PollCard({ name, votes, onClick }: PollCardProps) {
  return (
    <Card 
      sx={{ mb: 2, cursor: 'pointer' }}
      onClick={onClick}
    >
      <CardContent>
        <Typography variant="h6">
          {name.includes('_or_') 
            ? name.replace(/_/g, ' ') + '?'
            : name.replace(/_/g, ' ')}
        </Typography>
        <Typography color="textSecondary">
          {votes} votes
        </Typography>
      </CardContent>
    </Card>
  )
}

export default PollCard 