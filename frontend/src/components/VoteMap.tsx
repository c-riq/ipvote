import React, { useState } from 'react';
import { 
  ComposableMap, 
  Geographies, 
  Geography, 
  ZoomableGroup 
} from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { Box, Typography } from '@mui/material';
import geoData from './VoteMapCountries.json';
import InfoBox from './InfoBox';


interface VoteMapProps {
  votesByCountry: { [key: string]: { [option: string]: number } };
  options: string[];
}

// Map of country codes to names exactly as they appear in VoteMapCountries.json
const countryCodeToName: { [key: string]: string } = {
  'DE': 'Germany',
  'US': 'United States of America',
  'GB': 'United Kingdom',
  'FR': 'France',
  'IT': 'Italy',
  'ES': 'Spain',
  'CH': 'Switzerland',
  'CN': 'China',
  'CO': 'Colombia',
  'CZ': 'Czech Republic',
  'DK': 'Denmark',
  'AT': 'Austria',
  'BE': 'Belgium',
  'NL': 'Netherlands',
  'PL': 'Poland',
  'SE': 'Sweden',
  'NO': 'Norway',
  'FI': 'Finland',
  'JP': 'Japan',
  'KR': 'South Korea',
  'IN': 'India',
  'BR': 'Brazil',
  'CA': 'Canada',
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'RU': 'Russia',
  'UA': 'Ukraine',
  'TR': 'Turkey',
  'IE': 'Ireland',
  'PT': 'Portugal',
  'GR': 'Greece',
  'HU': 'Hungary',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'HR': 'Croatia',
  'SK': 'Slovakia',
  'SI': 'Slovenia',
  'EE': 'Estonia',
  'LV': 'Latvia',
  'LT': 'Lithuania',
  'IS': 'Iceland',
  'MX': 'Mexico',
  'AR': 'Argentina',
  'CL': 'Chile',
  'ZA': 'South Africa',
  'TH': 'Thailand',
  'VN': 'Vietnam',
  'MY': 'Malaysia',
  'SG': 'Singapore',
  'ID': 'Indonesia',
  'AF': 'Afghanistan',
  'AL': 'Albania',
  'DZ': 'Algeria',
  'AO': 'Angola',
  'AM': 'Armenia',
  'AZ': 'Azerbaijan',
  'BH': 'Bahrain',
  'BD': 'Bangladesh',
  'BY': 'Belarus',
  'BJ': 'Benin',
  'BT': 'Bhutan',
  'BO': 'Bolivia',
  'BA': 'Bosnia and Herzegovina',
  'BW': 'Botswana',
  'BN': 'Brunei',
  'BF': 'Burkina Faso',
  'BI': 'Burundi',
  'KH': 'Cambodia',
  'CM': 'Cameroon',
  'CF': 'Central African Republic',
  'TD': 'Chad',
  'CG': 'Congo',
  'CD': 'Dem. Rep. Congo',
  'CI': 'Ivory Coast',
  'CY': 'Cyprus',
  'DJ': 'Djibouti',
  'DO': 'Dominican Republic',
  'EC': 'Ecuador',
  'EG': 'Egypt',
  'GQ': 'Equatorial Guinea',
  'ER': 'Eritrea',
  'ET': 'Ethiopia',
  'GA': 'Gabon',
  'GM': 'Gambia',
  'GE': 'Georgia',
  'GH': 'Ghana',
  'GN': 'Guinea',
  'GW': 'Guinea-Bissau',
  'GY': 'Guyana',
  'HT': 'Haiti',
  'HN': 'Honduras',
  'IQ': 'Iraq',
  'IR': 'Iran',
  'IL': 'Israel',
  'JM': 'Jamaica',
  'JO': 'Jordan',
  'KZ': 'Kazakhstan',
  'KE': 'Kenya',
  'KW': 'Kuwait',
  'KG': 'Kyrgyzstan',
  'LA': 'Laos',
  'LB': 'Lebanon',
  'LS': 'Lesotho',
  'LR': 'Liberia',
  'LY': 'Libya',
  'MK': 'Macedonia',
  'MG': 'Madagascar',
  'MW': 'Malawi',
  'ML': 'Mali',
  'MR': 'Mauritania',
  'MD': 'Moldova',
  'MN': 'Mongolia',
  'ME': 'Montenegro',
  'MA': 'Morocco',
  'MZ': 'Mozambique',
  'MM': 'Myanmar',
  'NA': 'Namibia',
  'NP': 'Nepal',
  'NI': 'Nicaragua',
  'NE': 'Niger',
  'NG': 'Nigeria',
  'OM': 'Oman',
  'PK': 'Pakistan',
  'PS': 'Palestine',
  'PA': 'Panama',
  'PY': 'Paraguay',
  'PE': 'Peru',
  'PH': 'Philippines',
  'QA': 'Qatar',
  'RW': 'Rwanda',
  'SA': 'Saudi Arabia',
  'SN': 'Senegal',
  'RS': 'Serbia',
  'SL': 'Sierra Leone',
  'SO': 'Somalia',
  'SS': 'South Sudan',
  'SD': 'Sudan',
  'SR': 'Suriname',
  'SZ': 'Eswatini',
  'SY': 'Syria',
  'TJ': 'Tajikistan',
  'TZ': 'Tanzania',
  'TL': 'Timor-Leste',
  'TG': 'Togo',
  'TN': 'Tunisia',
  'TM': 'Turkmenistan',
  'UG': 'Uganda',
  'AE': 'United Arab Emirates',
  'UY': 'Uruguay',
  'UZ': 'Uzbekistan',
  'VE': 'Venezuela',
  'EH': 'W. Sahara',
  'YE': 'Yemen',
  'ZM': 'Zambia',
  'ZW': 'Zimbabwe',
  'TW': 'Taiwan',
  'XK': 'Kosovo',
  'CU': 'Cuba',
  'PR': 'Puerto Rico'
};

// Add this color generation utility function at the top
const generateColor = (index: number, totalOptions: number) => {
  if (totalOptions === 2) {
    return index === 0 ? '#4169E1' : '#ff6969';
  }
  
  // Use golden ratio for more evenly distributed colors
  const goldenRatio = 0.618033988749895;
  const hue = (index * goldenRatio * 360) % 360;
  const saturation = 70 + (index % 3) * 10;  // Vary between 70-90
  const lightness = 45 + (index % 3) * 5;    // Vary between 45-55
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const VoteMap: React.FC<VoteMapProps> = ({ votesByCountry, options }) => {
  const [selectedCountry, setSelectedCountry] = useState<{
    country: string;
    votes: { [key: string]: number };
    total: number;
    winner: string;
  } | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState(false);

  // Convert country codes to names for mapping
  const votesByCountryName = Object.entries(votesByCountry).reduce((acc, [code, votes]) => {
    const countryName = countryCodeToName[code];
    if (countryName) {
      acc[countryName] = votes;
    }
    return acc;
  }, {} as { [key: string]: { [option: string]: number } });

  // Calculate total votes per country
  const countryTotals = Object.entries(votesByCountryName).reduce((acc, [country, votes]) => {
    acc[country] = Object.values(votes).reduce((sum, count) => sum + count, 0);
    return acc;
  }, {} as { [key: string]: number });

  // Find maximum votes for scaling
  const maxVotes = Math.max(...Object.values(countryTotals));

  // Create color scale for opacity
  const opacityScale = scaleLinear<number>()
    .domain([0, maxVotes])
    .range([0.2, 0.8]);

  // Update the getCountryColor function
  const getCountryColor = (countryName: string) => {
    const votes = votesByCountryName[countryName];
    if (!votes || Object.values(votes).reduce((sum, count) => sum + count, 0) === 0) {
      return 'rgba(128, 128, 128, 0.1)';
    }

    const opacity = opacityScale(Object.values(votes).reduce((sum, count) => sum + count, 0));
    
    // Check for ties by finding the maximum vote count and counting how many options have that count
    const maxVoteCount = Math.max(...Object.values(votes));
    const optionsWithMaxVotes = Object.entries(votes).filter(([_, count]) => count === maxVoteCount);
    
    // If there's a tie (more than one option with max votes), return pale purple
    if (optionsWithMaxVotes.length > 1) {
      return `rgba(194, 120, 255, ${opacity})`;
    }

    const winningOption = Object.entries(votes).reduce((max, [option, count]) => 
      count > (votes[max] || 0) ? option : max
    , options[0]);
    
    const optionIndex = options.indexOf(winningOption);
    if (options.length === 2) {
      return `rgba(${optionIndex === 0 ? '65, 105, 225' : '255, 105, 105'}, ${opacity})`;
    }
    
    const baseColor = generateColor(optionIndex, options.length);
    return baseColor.replace('hsl', 'hsla').replace(')', `, ${opacity})`);
  };

  // Calculate winning option for each country
  const countryWinners = Object.entries(votesByCountryName).reduce((acc, [country, votes]) => {
    const winner = Object.entries(votes).reduce((max, [option, count]) => 
      count > (votes[max] || 0) ? option : max
    , options[0]);
    acc[country] = winner;
    return acc;
  }, {} as { [key: string]: string });

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Votes by Country
      </Typography>
      <Typography variant="body1" gutterBottom>
        The country association is based on the IP address of the user
        and public data, which countries are associated with which IP addresses.
        This is not always accurate, but it is a good approximation. 
        IP address data powered by <a href="https://ipinfo.io">IPinfo</a>.
        For more information on how the accuracy can be further improved, see&nbsp;
        <a href="/ui/geolocation">Geolocation</a>.
      </Typography>

      <InfoBox
        height="80px"
        selected={selectedCountry ? {
          title: selectedCountry.country,
          total: selectedCountry.total,
          votes: selectedCountry.votes
        } : undefined}
        placeholder="Hover over a country to see voting details"
      />

      {/* Map container */}
      <Box sx={{ 
        width: '100%', 
        height: {
          xs: '300px',
          sm: '340px',
          md: '380px'
        },
        border: '1px solid #ddd',
        borderRadius: 1,
        overflow: 'hidden'
      }}>
        <ComposableMap 
          projectionConfig={{ scale: 130 }}
          height={350}
        >
          {zoomEnabled ? (
            <ZoomableGroup>
              <g>
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const countryName = geo.properties.name;
                      const votes = countryTotals[countryName] || 0;
                      const winner = countryWinners[countryName];
                      const countryVotes = votesByCountryName[countryName] || {};
                      
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={getCountryColor(countryName)}
                          stroke="#D6D6DA"
                          style={{
                            default: {
                              outline: 'none'
                            },
                            hover: {
                              fill: '#FFFFFF',
                              outline: 'none'
                            },
                            pressed: {
                              outline: 'none'
                            }
                          }}
                          onMouseEnter={() => {
                            setSelectedCountry({
                              country: countryName,
                              votes: countryVotes,
                              total: votes,
                              winner: winner
                            });
                          }}
                          onMouseLeave={() => {
                            setSelectedCountry(null);
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </g>
            </ZoomableGroup>
          ) : (
            <g onClick={() => setZoomEnabled(true)}>
              <Geographies geography={geoData}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const countryName = geo.properties.name;
                    const votes = countryTotals[countryName] || 0;
                    const winner = countryWinners[countryName];
                    const countryVotes = votesByCountryName[countryName] || {};
                    
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={getCountryColor(countryName)}
                        stroke="#D6D6DA"
                        style={{
                          default: {
                            outline: 'none'
                          },
                          hover: {
                            fill: '#FFFFFF',
                            outline: 'none'
                          },
                          pressed: {
                            outline: 'none'
                          }
                        }}
                        onMouseEnter={() => {
                          setSelectedCountry({
                            country: countryName,
                            votes: countryVotes,
                            total: votes,
                            winner: winner
                          });
                        }}
                        onMouseLeave={() => {
                          setSelectedCountry(null);
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </g>
          )}
        </ComposableMap>
      </Box>

      {!zoomEnabled && (
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          Click the map to enable zoom and pan
        </Typography>
      )}

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
        <Typography variant="caption" sx={{ color: 'rgb(194, 120, 255)' }}>
          Tie
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgb(128, 128, 128)' }}>
          No data
        </Typography>
      </Box>
    </Box>
  );
};

export default VoteMap; 