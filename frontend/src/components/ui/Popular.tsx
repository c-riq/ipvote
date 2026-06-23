import { useState, useEffect, useRef } from 'react'
import { CircularProgress, Button, Popover, Paper, FormControl, FormLabel, FormGroup, FormControlLabel, Checkbox } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PollCard from './PollCard'
import PrivacyAccept from './PrivacyAccept'
import { IpInfoResponse, PhoneVerificationState } from '../../App'
import { CAPTCHA_THRESHOLD, POPULAR_POLLS_HOST, VALID_TAGS } from '../../constants'
import FilterListIcon from '@mui/icons-material/FilterList'
import RecentVotes from './RecentVotes'

const LIMIT = 15

export interface PollData {
  name: string
  votes: number
  isUpdating?: boolean
  isOpen?: boolean
  tags?: string[]
}

interface PopularProps {
  privacyAccepted: boolean
  userIpInfo: IpInfoResponse | null
  onPrivacyAcceptChange: (accepted: boolean) => void
  query: string
  captchaToken: string | undefined
  setCaptchaToken: (token: string) => void
  phoneVerification: PhoneVerificationState | null
}

function Popular({ privacyAccepted, userIpInfo, onPrivacyAcceptChange, 
    query, captchaToken, setCaptchaToken, phoneVerification }: PopularProps) {
  const [polls, setPolls] = useState<PollData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [seed] = useState(1)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const lastQueryTimestampRef = useRef<number>(0)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterOpen, setFilterOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  // Initialize selectedTags from URL params or default values
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => {
    const tagParam = searchParams.get('tags');
    if (tagParam) {
      return new Set(tagParam.split(','));
    }
    return new Set(['all']);
  });

  const handleTagChange = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (tag === 'all') {
      // If 'all' is selected, clear other selections
      setSelectedTags(new Set(['all']));
      setSearchParams(query ? { q: query } : {});  // Preserve search query
    } else {
      // If another tag is selected, remove 'all'
      newTags.delete('all');
      if (newTags.has(tag)) {
        newTags.delete(tag);
        // If no tags selected, default to 'all'
        if (newTags.size === 0) {
          newTags.add('all');
          setSearchParams(query ? { q: query } : {});  // Preserve search query
        } else {
          setSearchParams({ 
            ...(query ? { q: query } : {}),
            tags: Array.from(newTags).join(',') 
          });
        }
      } else {
        newTags.add(tag);
        setSearchParams({ 
          ...(query ? { q: query } : {}),
          tags: Array.from(newTags).join(',') 
        });
      }
      setSelectedTags(newTags);
    }
  };

  useEffect(() => {
    setOffset(0);
    setPolls([]);
    fetchPopularPolls(false);
  }, [selectedTags]);

  // Modify useEffect for query changes to reset tags when searching
  useEffect(() => {
    setOffset(0);
    setPolls([]);
    if (query) {
      // Reset to 'all' tags when searching
      setSelectedTags(new Set(['all']));
      setSearchParams({ q: query }); // Only keep search parameter
    }
    fetchPopularPolls(false);
  }, [query]);

  const handleFilterClick = (_: React.MouseEvent<HTMLButtonElement>) => {
    setFilterOpen(true);
  };

  const handleFilterClose = () => {
    setFilterOpen(false);
  };

  useEffect(() => {
    if (offset > 0) {
      fetchPopularPolls(true)
    }
  }, [offset])

  const fetchPopularPolls = async (loadMore = false, pollToUpdate: string = '') => {

    if (loadMore) {
      setLoadingMore(true)
    } else {
      if (!pollToUpdate) {
        setLoading(true)
      } else {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...poll, isUpdating: true }
            : poll
        ))
      }
    }

    try {
      const queryTimestamp = Date.now()
      lastQueryTimestampRef.current = queryTimestamp
      console.log('fetchPopularPolls', queryTimestamp, query)
      const tagsParam = selectedTags.has('all') ? '' : 
        `&tags=${Array.from(selectedTags).map(t => encodeURIComponent(t)).join(',')}`;
      const response = await fetch(
        `${POPULAR_POLLS_HOST}/?limit=${LIMIT}&offset=${offset}&seed=${
          seed}&q=${encodeURIComponent(query)}&pollToUpdate=${pollToUpdate}${tagsParam}`
      )
      const res = await response.json()

      if (queryTimestamp < lastQueryTimestampRef.current) {
        console.log('Ignoring stale response from earlier query')
        return
      }

      const formattedPolls = res.data.map(([name, votes]: [string, number]) => ({
        name,
        votes,
        isOpen: name.startsWith('open_')
      }))

      if (loadMore) {
        setPolls(prev => [...prev, ...formattedPolls])
      } else if (pollToUpdate) {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...formattedPolls[0], isUpdating: false }
            : poll
        ))
      } else {
        setPolls(formattedPolls)
      }
      setHasMore(formattedPolls.length === LIMIT)
    } catch (error) {
      console.error('Error fetching popular polls:', error)
      if (pollToUpdate) {
        setPolls(prev => prev.map(poll => 
          poll.name === pollToUpdate 
            ? { ...poll, isUpdating: false }
            : poll
        ))
      }
    }
    setLoading(false)
    setLoadingMore(false)
  }

  const loadMore = () => {
    setOffset(prev => prev + LIMIT)
  }

  const handlePollClick = (poll: string, event: React.MouseEvent) => {
    const parsedPoll = poll.replace('%2C', ',')
    const isOpen = poll.startsWith('open_')
    const path = isOpen ? `/open/${encodeURIComponent(parsedPoll.replace(/^open_/g, ''))}` : `/${encodeURIComponent(parsedPoll)}`
    if (event.metaKey || event.ctrlKey) {
      // Open in new tab
      window.open(path, '_blank')
    } else {
      // Regular navigation
      navigate(path)
    }
  }

  const handleVote = (poll: string) => {
    fetchPopularPolls(false, poll)
  }

  return (
    <div>
      <h2 style={{
        margin: '0 0 32px 0',
        fontSize: '2rem',
        fontWeight: 700,
        color: '#1A2B3C',
        textAlign: 'center'
      }}>
        Let the internet vote!
      </h2>

      <RecentVotes onPollClick={handlePollClick} />

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        marginTop: '32px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 600,
          color: '#1A2B3C'
        }}>
          Popular Polls
        </h3>
        <Button
          ref={anchorRef}
          variant="outlined"
          onClick={handleFilterClick}
          startIcon={<FilterListIcon />}
          size="medium"
          sx={{
            borderColor: '#2D7DC5',
            color: '#2D7DC5',
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': {
              borderColor: '#1E6AAD',
              backgroundColor: 'rgba(45, 125, 197, 0.08)',
              color: '#1E6AAD'
            }
          }}
        >
          Filter by Tags
        </Button>
      </div>

      <Popover
        open={filterOpen}
        anchorEl={anchorRef.current}
        onClose={handleFilterClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        disablePortal
      >
        <Paper sx={{
          p: 3,
          backgroundColor: '#FFFFFF',
          border: '1px solid #C8DDEF',
          borderRadius: '12px',
          minWidth: '250px',
          boxShadow: '0 4px 16px rgba(45, 125, 197, 0.12)'
        }}>
          <FormControl component="fieldset">
            <FormLabel
              component="legend"
              sx={{
                color: '#1A2B3C',
                fontWeight: 600,
                fontSize: '1rem',
                mb: 2
              }}
            >
              Filter by Tags
            </FormLabel>
            <FormGroup>
              {VALID_TAGS.map((tagOption) => (
                <FormControlLabel
                  key={tagOption}
                  control={
                    <Checkbox
                      checked={selectedTags.has(tagOption)}
                      onChange={() => handleTagChange(tagOption)}
                      sx={{
                        color: '#7A9DBB',
                        '&.Mui-checked': {
                          color: '#2D7DC5',
                        }
                      }}
                    />
                  }
                  label={tagOption.charAt(0).toUpperCase() + tagOption.slice(1)}
                  sx={{
                    color: '#4A6480',
                    '& .MuiFormControlLabel-label': {
                      fontSize: '0.95rem'
                    }
                  }}
                />
              ))}
            </FormGroup>
          </FormControl>
        </Paper>
      </Popover>

      <PrivacyAccept
        userIpInfo={userIpInfo}
        accepted={privacyAccepted}
        onAcceptChange={onPrivacyAcceptChange}
        setCaptchaToken={setCaptchaToken}
        captchaToken={captchaToken}
        showCaptcha={showCaptcha}
      />
      
      <div style={{ marginTop: '20px' }} />
      
      {loading ? (
        <div style={{
          width: '100%',
          maxWidth: '500px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <CircularProgress />
        </div>
      ) : (
        polls.length > 0 ? (
          polls.map((poll) => (
            <PollCard
            key={`${poll.name}-${poll.votes}`}
            poll={poll.name}
            votes={poll.votes}
            onClick={(e) => handlePollClick(poll.name, e)}
            handleVote={handleVote}
            privacyAccepted={privacyAccepted}
            isUpdating={poll.isUpdating}
            captchaToken={captchaToken}
            userIpInfo={userIpInfo}
            requireCaptcha={poll.votes > CAPTCHA_THRESHOLD}
            setShowCaptcha={setShowCaptcha}
            phoneVerification={phoneVerification}
          />
        ))
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          color: '#4A6480',
          backgroundColor: '#FFFFFF',
          border: '1px solid #C8DDEF',
          borderRadius: '12px',
          marginTop: '24px'
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
            No polls found {query ? 'matching your search' : 'in this category'}
          </p>
          {selectedTags.size > 1 && (
            <p style={{ fontSize: '0.95rem', color: '#7A9DBB' }}>
              Try selecting a different category or view all polls
            </p>
          )}
        </div>
      ))}
      
      {hasMore && !loading && (
        <Button
          onClick={loadMore}
          disabled={loadingMore}
          variant="outlined"
          fullWidth
          sx={{
            marginTop: '24px',
            padding: '14px',
            borderRadius: '10px',
            borderColor: '#2D7DC5',
            color: '#2D7DC5',
            fontSize: '1rem',
            fontWeight: 600,
            textTransform: 'none',
            '&:hover': {
              borderColor: '#1E6AAD',
              backgroundColor: 'rgba(45, 125, 197, 0.08)',
              color: '#1E6AAD'
            },
            '&.Mui-disabled': {
              borderColor: '#C8DDEF',
              color: '#7A9DBB'
            }
          }}
        >
          {loadingMore ? <CircularProgress size={20} /> : 'Load More'}
        </Button>
      )}
    </div>
  )
}

export default Popular 