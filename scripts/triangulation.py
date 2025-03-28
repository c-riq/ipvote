import pandas as pd
import matplotlib as plt
import os
import json
import numpy as np
from scipy.optimize import minimize
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature

data = []

for file in os.listdir('../s3/triangulation/'):
    if file.endswith('.json'):
        with open(f'../s3/triangulation/{file}', 'r') as f:
            contents = json.load(f)
            data.append(contents)
df = pd.DataFrame(data)

nonce = 'ieoskirlyzauuv6ehdug8lift65fkrddeuu6f5z6ka'

lambdaStartTimestamp = int(df[(df.event == 'nonceGeneratedAtMaster') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0])
nonceSentTime = int(df[(df.event == 'nonceGeneratedAtMaster') & (df.nonce == nonce)].nonceSentTime.iloc[0])

clientStartTimestamp = int(df[~(df.clientStartTimestamp.isna()) & (df.nonce == nonce)].clientStartTimestamp.iloc[0])

clientReceivedNonceTimestamp = int(df[(~df.clientReceivedNonceTimestamp.isna()) & (df.nonce == nonce)].clientReceivedNonceTimestamp.iloc[0])

requestReceived_eu_central_1 = df[(df.awsRegionOfSlave == 'eu-central-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_ap_northeast_1 = df[(df.awsRegionOfSlave == 'ap-northeast-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_sa_east_1 = df[(df.awsRegionOfSlave == 'sa-east-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_us_east_1 = df[(df.awsRegionOfSlave == 'us-east-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]

time_shift = ((lambdaStartTimestamp - clientStartTimestamp) + (nonceSentTime - clientReceivedNonceTimestamp)) / 2

client_to_eu = requestReceived_eu_central_1 - (clientReceivedNonceTimestamp + time_shift)
client_to_ap = requestReceived_ap_northeast_1 - (clientReceivedNonceTimestamp + time_shift) 
client_to_sa = requestReceived_sa_east_1 - (clientReceivedNonceTimestamp + time_shift) 
client_to_us = requestReceived_us_east_1 - (clientReceivedNonceTimestamp + time_shift) 

print(f'time_shift: {time_shift}',
        f'client_to_eu: {client_to_eu}', f'client_to_ap: {client_to_ap}',
        f'client_to_sa: {client_to_sa}',f'client_to_us: {client_to_us}', nonce[:10])

# coordinates of data centers
DATACENTERS = {
    'eu-central-1': (50.1109, 8.6821),    # Frankfurt
    'ap-northeast-1': (35.6762, 139.6503), # Tokyo
    'sa-east-1': (-23.5505, -46.6333),    # São Paulo
    'us-east-1': (39.0438, -77.4874)      # N. Virginia
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance between two points on Earth."""
    R = 6371  # Earth's radius in kilometers
    
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def objective_function(coords, latencies, network_speed):
    """Calculate the sum of squared errors between measured and expected latencies."""
    lat, lon = coords
    error = 0
    
    for region, (dc_lat, dc_lon) in DATACENTERS.items():
        if region in latencies:
            distance = haversine_distance(lat, lon, dc_lat, dc_lon)
            expected_latency = (distance / network_speed) * 1000  # Convert to milliseconds
            error += (expected_latency - latencies[region])**2
            
    return error

def triangulate_position(latencies, network_speed=None):
    """Estimate geographical position based on latency measurements."""
    if network_speed is None:
        # Speed of light in fiber optic cable (roughly 2/3 of c)
        network_speed = 200000  # km/s
    
    # Initial guess (weighted average of datacenters)
    total_weight = sum(1/lat for lat in latencies.values())
    initial_lat = sum(DATACENTERS[dc][0] / latencies[dc] for dc in latencies) / total_weight
    initial_lon = sum(DATACENTERS[dc][1] / latencies[dc] for dc in latencies) / total_weight
    
    # Optimize to find best position
    result = minimize(
        objective_function,
        x0=[initial_lat, initial_lon],
        args=(latencies, network_speed),
        method='Nelder-Mead',
        bounds=[(-90, 90), (-180, 180)]
    )
    
    if result.success:
        return {
            'latitude': result.x[0],
            'longitude': result.x[1],
            'confidence_score': 1 / (1 + result.fun)
        }
    else:
        return None

def sample_with_noise(latencies, samples=50, latency_noise_percent=30, speed_noise_percent=50, 
                     base_speed=200000, latency_adjustment_ms=0):
    """Generate multiple samples with random noise in both latency and network speed.
    
    Args:
        latencies: Dict of region to latency measurements
        samples: Number of samples to generate
        latency_noise_percent: Percentage of random noise to add to latencies
        speed_noise_percent: Percentage of random noise to add to network speed
        base_speed: Base speed of light in fiber (km/s), default 200,000 km/s (≈2/3 c)
        latency_adjustment_ms: Systematic latency adjustment in milliseconds (added to all measurements)
    """
    positions = []
    noisy_latencies = {}
    
    for _ in range(samples):
        # Add random noise to each latency measurement
        for region, latency in latencies.items():
            # Add systematic latency adjustment first
            adjusted_latency = latency + latency_adjustment_ms
            # Then add random noise
            noise = np.random.uniform(-latency_noise_percent/100, latency_noise_percent/100) * adjusted_latency
            noisy_latencies[region] = max(0.1, adjusted_latency + noise)
        
        # Add random noise to network speed
        speed_noise = np.random.uniform(-speed_noise_percent/100, speed_noise_percent/100) * base_speed
        network_speed = max(base_speed/4, base_speed + speed_noise)  # Ensure speed doesn't go too low
        
        # Triangulate position with noisy measurements
        position = triangulate_position(noisy_latencies, network_speed)
        if position and all(np.isfinite([position['latitude'], position['longitude'], position['confidence_score']])):
            positions.append((position['latitude'], position['longitude'], position['confidence_score']))
    
    return positions

def plot_positions(positions, original_position=None):
    """Plot the positions on a world map."""
    plt.figure(figsize=(15, 10))
    ax = plt.axes(projection=ccrs.PlateCarree())
    
    # Add map features
    ax.add_feature(cfeature.LAND)
    ax.add_feature(cfeature.OCEAN)
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS, linestyle=':')
    
    # Plot datacenter locations
    for name, (lat, lon) in DATACENTERS.items():
        ax.plot(lon, lat, 'r^', markersize=10, transform=ccrs.PlateCarree(), label=name)
        ax.text(lon, lat, name, transform=ccrs.PlateCarree())
    
    # Plot sampled positions with confidence-based transparency
    lats, lons, confidences = zip(*positions)
    confidences = np.array(confidences)
    # Normalize confidences for better visualization
    alphas = (confidences - confidences.min()) / (confidences.max() - confidences.min())
    
    scatter = ax.scatter(lons, lats, c=confidences, cmap='viridis', 
                        alpha=0.6, transform=ccrs.PlateCarree(),
                        label='Estimated positions')
    plt.colorbar(scatter, label='Confidence Score')
    
    # Plot original position if provided
    if original_position:
        ax.plot(original_position[1], original_position[0], 'r*', 
                markersize=15, transform=ccrs.PlateCarree(),
                label='Original position')
    
    # Set map bounds with some padding
    all_lons = list(lons) + [dc[1] for dc in DATACENTERS.values()]
    all_lats = list(lats) + [dc[0] for dc in DATACENTERS.values()]
    padding = 20
    ax.set_extent([
        min(all_lons) - padding,
        max(all_lons) + padding,
        min(all_lats) - padding,
        max(all_lats) + padding
    ])
    
    plt.title('Triangulation Results with 30% Noise')
    plt.legend()
    plt.grid(True)
    plt.show()

# Example usage with different parameters
latencies = {
    'eu-central-1': client_to_eu,
    'ap-northeast-1': client_to_ap,
    'sa-east-1': client_to_sa,
    'us-east-1': client_to_us
}

# Get original position with default parameters
original_position = triangulate_position(latencies)
if original_position:
    print(f"Original position: {original_position['latitude']:.4f}°N, {original_position['longitude']:.4f}°E")
    print(f"Confidence score: {original_position['confidence_score']:.4f}")

# Sample positions with custom parameters
positions = sample_with_noise(
    latencies,
    samples=50,
    latency_noise_percent=30,
    speed_noise_percent=50,
    base_speed=180000,  # Slightly slower than default to account for network overhead
    latency_adjustment_ms=10  # Add 10ms systematic delay to account for processing time
)

# Plot results
plot_positions(positions, (original_position['latitude'], original_position['longitude']) if original_position else None)

