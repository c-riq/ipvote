import pandas as pd
import matplotlib as plt
import os
import json
import numpy as np
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.patches as mpatches
from cartopy.geodesic import Geodesic
import time

def calculate_max_distance(time_ms):
    """
    Calculate the maximum possible distance in kilometers given a time delay in milliseconds.
    Using speed of light through fiber optic cables (approximately 2/3 of c)
    and accounting for routing/electronics delays (factor 1.2)
    Subtracting 6ms for AWS Lambda cold start
    """
    SPEED_OF_LIGHT = 299792.458  # km/s
    FIBER_FACTOR = 2/3  # typical speed in fiber is ~2/3 of c
    ROUTING_FACTOR = 1.4  # additional delay from routing and electronics
    LAMBDA_STARTUP = 10  # ms for AWS Lambda cold start
    
    # Convert milliseconds to seconds and calculate distance
    time_s = max(0, (time_ms - LAMBDA_STARTUP)) / 1000
    max_distance = (time_s * SPEED_OF_LIGHT * FIBER_FACTOR) / ROUTING_FACTOR
    return max_distance

# coordinates of data centers
DATACENTERS = {
    'eu-central-1': (50.1109, 8.6821),    # Frankfurt
    'eu-west-1': (53.3498, -6.2603), # Ireland
    'ap-northeast-1': (35.6762, 139.6503), # Tokyo
    'ap-south-1': (19.0760, 72.8777), # Mumbai
    'sa-east-1': (-23.5505, -46.6333),    # São Paulo
    'us-east-1': (39.0438, -77.4874),      # N. Virginia
    'us-west-2': (33.7490, -116.4568),   # Oregon
    'af-south-1': (-33.9249, 18.4241), # Cape Town
}

# Get current timestamp
current_time = time.time() * 1000  # convert to milliseconds
n_minutes_ago = current_time - (70 * 60 * 1000)  # 70 minutes in milliseconds

# Filter for recent files
recent_data = []
for file in os.listdir('../s3/triangulation/'):
    if file.endswith('.json'):
        with open(f'../s3/triangulation/{file}', 'r') as f:
            contents = json.load(f)
            if contents.get('lambdaStartTimestamp', 0) > n_minutes_ago:
                recent_data.append(contents)


recent_df = pd.DataFrame(recent_data)



# Calculate all clock shifts first
clock_shifts = []
nonce_shifts = {}  # Store clock shifts by nonce
for nonce in recent_df['nonce'].unique():
    nonce_df = recent_df[recent_df['nonce'] == nonce]
    
    try:
        lambda_start = int(nonce_df[(nonce_df.event == 'nonceGeneratedAtMaster')].lambdaStartTimestamp.iloc[0])
        nonce_sent = int(nonce_df[(nonce_df.event == 'nonceGeneratedAtMaster')].nonceSentTime.iloc[0])
        client_start = int(nonce_df[~(nonce_df.clientStartTimestamp.isna())].clientStartTimestamp.iloc[0])
        client_received = int(nonce_df[~(nonce_df.clientReceivedNonceTimestamp.isna())].clientReceivedNonceTimestamp.iloc[0])
        
        time_shift = ((lambda_start - client_start) + (nonce_sent - client_received)) / 2
        clock_shifts.append(time_shift)
        nonce_shifts[nonce] = time_shift
    except (IndexError, KeyError):
        continue

# Calculate median and identify valid nonces
median_shift = np.median(clock_shifts)
valid_nonces = {nonce for nonce, shift in nonce_shifts.items() 
                if abs(shift - median_shift) <= 20}

print(f"\nMedian clock shift: {median_shift:.2f} ms")
print(f"Valid nonces: {len(valid_nonces)} out of {len(nonce_shifts)}")
print("\nAll time shifts (ms):")
for nonce, shift in nonce_shifts.items():
    valid = "✓" if nonce in valid_nonces else "✗"
    print(f"Nonce {nonce}: {shift:.2f} ms, {median_shift - shift:.2f} ms, {valid}")

# Find minimum latencies using only valid nonces
min_latencies = {
    'eu-central-1': float('inf'),
    'ap-northeast-1': float('inf'),
    'ap-south-1': float('inf'),
    'eu-west-1': float('inf'),
    'sa-east-1': float('inf'),
    'us-east-1': float('inf'),
    'us-west-2': float('inf'),
    'af-south-1': float('inf')
}

for nonce in valid_nonces:  # Only process valid nonces
    nonce_df = recent_df[recent_df['nonce'] == nonce]
    
    try:
        client_received = int(nonce_df[~(nonce_df.clientReceivedNonceTimestamp.isna())].clientReceivedNonceTimestamp.iloc[0])
        
        # Update minimum latencies using the specific nonce's clock shift
        for region in min_latencies.keys():
            try:
                request_received = nonce_df[(nonce_df.awsRegionOfSlave == region)].lambdaStartTimestamp.iloc[0]
                latency = request_received - (client_received + nonce_shifts[nonce])
                min_latencies[region] = min(min_latencies[region], latency)
            except (IndexError, KeyError):
                continue
                
    except (IndexError, KeyError):
        continue

print("\nMinimum latencies from measurements in the last 10 minutes:")
for region, latency in min_latencies.items():
    if latency != float('inf'):
        print(f"{region}: {latency:.2f} ms")
        print(f"Maximum distance: {calculate_max_distance(latency):.2f} km")

# Create the visualization
plt.figure(figsize=(15, 10))
ax = plt.axes(projection=ccrs.PlateCarree())

# Add map features
ax.add_feature(cfeature.COASTLINE)
ax.add_feature(cfeature.BORDERS)
ax.set_global()

# Calculate distances from minimum latencies
min_distances = {
    region: calculate_max_distance(latency)
    for region, latency in min_latencies.items()
    if latency != float('inf')
}

# Plot each datacenter and its minimum latency circle
colors = ['blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue']
geod = Geodesic()

for (dc_name, coords), color in zip(DATACENTERS.items(), colors):
    if dc_name not in min_distances:
        continue
        
    lat, lon = coords
    
    # Plot the datacenter point
    ax.plot(lon, lat, 'o', color=color, markersize=8, transform=ccrs.PlateCarree(), 
            label=f"{dc_name} (min latency: {min_latencies[dc_name]:.1f}ms)")
    
    # Create circle of minimum latency distance
    radius_km = min_distances[dc_name]
    
    # Generate circle points using geodesic
    circle_points = geod.circle(lon=lon, lat=lat, radius=radius_km * 1000)
    
    # Create a polygon patch
    polygon = mpatches.Polygon(circle_points, 
                             color=color,
                             alpha=0.2,
                             transform=ccrs.Geodetic())
    
    # Add the polygon patch to the map
    ax.add_patch(polygon)
    
    # Plot the circle border
    ax.plot(circle_points[:, 0], circle_points[:, 1], 
            color=color, transform=ccrs.Geodetic(), alpha=0.5)

# Add legend and title
ax.legend()
plt.title('Maximum Distance Circles Based on Minimum Latencies (Last 10 Minutes)')

# Show the plot
plt.show()
