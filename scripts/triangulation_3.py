import pandas as pd
import matplotlib as plt
import os
import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
import matplotlib.patches as mpatches
import time
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from scipy.spatial import ConvexHull
import requests
from geopy.distance import geodesic
import folium
from folium import plugins
from pyproj import Geod

# Create a Geod object for geodesic calculations
geod = Geod(ellps='WGS84')

def calculate_max_distance(time_ms):
    """
    Calculate the maximum possible distance in kilometers given a time delay in milliseconds.
    Returns both minimum and maximum possible distances based on routing factors.
    """
    SPEED_OF_LIGHT = 299792.458  # km/s
    FIBER_FACTOR = 2/3  # typical speed in fiber is ~2/3 of c
    ROUTING_FACTOR_MIN = 1.1  # additional delay from routing and electronics
    ROUTING_FACTOR_MAX = 2  # additional delay from routing and electronics
    LAMBDA_STARTUP = 10  # ms for AWS Lambda cold start
    
    # Convert milliseconds to seconds and calculate distance
    time_s = max(0, (time_ms - LAMBDA_STARTUP)) / 1000
    max_distance_min = (time_s * SPEED_OF_LIGHT * FIBER_FACTOR) / ROUTING_FACTOR_MAX
    max_distance_max = (time_s * SPEED_OF_LIGHT * FIBER_FACTOR) / ROUTING_FACTOR_MIN
    return max_distance_min, max_distance_max

# coordinates of data centers - switch from (lat, lon) to (lon, lat)
DATACENTERS = {
    'eu-central-1': (8.6821, 50.1109),    # Frankfurt
    'eu-west-1': (-6.2603, 53.3498), # Ireland
    'ap-northeast-1': (139.6503, 35.6762), # Tokyo
    'ap-south-1': (72.8777, 19.0760), # Mumbai
    'sa-east-1': (-46.6333, -23.5505),    # São Paulo
    'us-east-1': (-77.4874, 39.0438),      # N. Virginia
    'us-west-2': (-116.4568, 33.7490),   # Oregon
    'af-south-1': (18.4241, -33.9249), # Cape Town
}

# Get current timestamp
current_time = time.time() * 1000  # convert to milliseconds
n_minutes_ago = current_time - (20* 60 * 60 * 1000)  # 10 minutes in milliseconds

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
        print(f"Maximum distance: {calculate_max_distance(latency)[1]:.2f} km")

# Calculate minimum distances from latencies
min_distances = {}
for region, latency in min_latencies.items():
    if latency != float('inf'):
        min_distances[region] = calculate_max_distance(latency)[1]

# Replace the geopandas world dataset with a simplified country boundaries
def get_world_boundaries():
    # Download simplified country boundaries from a GeoJSON source
    url = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    response = requests.get(url)
    countries = response.json()
    
    # Convert to dictionary of Shapely geometries with validation
    world_geometries = {}
    for feature in countries['features']:
        iso_code = feature['properties']['ISO_A2']
        if iso_code != '-99':  # Skip invalid codes
            try:
                coords = feature['geometry']['coordinates']
                if feature['geometry']['type'] == 'Polygon':
                    poly = Polygon(coords[0])
                    if poly.is_valid:
                        world_geometries[iso_code] = poly.buffer(0)  # Clean up geometry
                elif feature['geometry']['type'] == 'MultiPolygon':
                    polys = [Polygon(poly[0]) for poly in coords]
                    valid_polys = [p.buffer(0) for p in polys if p.is_valid]
                    if valid_polys:
                        world_geometries[iso_code] = MultiPolygon(valid_polys)
            except (ValueError, TypeError) as e:
                print(f"Skipping invalid geometry for {iso_code}: {e}")
                continue
    
    return world_geometries

# Create the visualization using folium instead of cartopy
def create_map(datacenters, min_distances, plot_points, plot_weights):
    center_lat = np.mean([lat for lon, lat in datacenters.values()])
    center_lon = np.mean([lon for lon, lat in datacenters.values()])
    m = folium.Map(location=[center_lat, center_lon], zoom_start=2)
    
    # Add datacenter markers and circles
    for dc_name, coords in datacenters.items():
        if dc_name not in min_distances:
            continue
            
        lon, lat = coords
        radius_km = min_distances[dc_name]
        
        # Add datacenter marker
        folium.CircleMarker(
            location=[lat, lon],
            radius=8,
            color='black',
            fill=True,
            popup=f"{dc_name}<br>Min latency: {min_latencies[dc_name]:.1f}ms"
        ).add_to(m)
        
        # Create geodesic circle points with proper handling of meridian crossing
        current_segment = []
        segments = []
        prev_lon = None
        crosses_meridian = False
        
        for bearing in range(0, 360, 5):  # Generate points every 5 degrees
            end_lon, end_lat, _ = geod.fwd(lon, lat, bearing, radius_km * 1000)
            
            # Check for meridian crossing
            if prev_lon is not None:
                if abs(end_lon - prev_lon) > 180:
                    # We crossed the meridian, start a new segment
                    crosses_meridian = True
                    segments.append(current_segment)
                    current_segment = []
            
            current_segment.append([end_lat, end_lon])
            prev_lon = end_lon
        
        # Add the last segment
        if current_segment:
            segments.append(current_segment)
        
        # Draw each segment separately
        for segment in segments:
            # Close the segment only if it doesn't cross the meridian
            if not crosses_meridian and segment == segments[-1]:
                segment.append(segments[0][0])  # Add first point to close the circle
                
            folium.PolyLine(
                locations=segment,
                color='black',
                weight=2,
                opacity=0.5
            ).add_to(m)
    
    # Add heatmap of possible locations
    if len(plot_points) > 0:
        heat_data = [[point[1], point[0], weight] 
                    for point, weight in zip(plot_points, plot_weights)]
        plugins.HeatMap(heat_data).add_to(m)
    
    return m

# Replace the visualization code with validation
world_boundaries = get_world_boundaries()
try:
    # Try to create a union of valid geometries only
    valid_geometries = [geom for geom in world_boundaries.values() 
                       if geom.is_valid and not geom.is_empty]
    land = unary_union(valid_geometries)
except Exception as e:
    print(f"Warning: Could not create land union: {e}")
    # Fallback to simple point-in-polygon checks without union
    land = MultiPolygon(valid_geometries)

# First, find the smallest radius and its corresponding datacenter
min_radius_dc = min(((dc, min_distances[dc]) for dc in min_distances), key=lambda x: x[1])
smallest_circle_dc = min_radius_dc[0]
smallest_radius = min_radius_dc[1]

# Calculate area of smallest circle (in km²)
circle_area = np.pi * (smallest_radius ** 2)

# Adjust number of points based on area
# Use 100 points per 1 million km² as a baseline
points_per_million_km2 = 30
n_points = max(100, int((circle_area / 1_000_000) * points_per_million_km2))

# Generate sample points within the smallest circle
sample_points = []
valid_weights = []

for i in range(n_points):
    # Generate random azimuth (0-360 degrees) and random distance
    angle = np.random.uniform(0, 360)
    # Use sqrt for uniform distribution within circle
    r = np.sqrt(np.random.random()) * smallest_radius * 1000  # Convert to meters
    
    dc_lon, dc_lat = DATACENTERS[smallest_circle_dc]
    # Use geodesic forward calculation to get the point
    lon, lat, _ = geod.fwd(dc_lon, dc_lat, angle, r)
    
    # Normalize longitude to [-180, 180]
    lon = ((lon + 180) % 360) - 180
    
    sample_points.append((lon, lat))

sample_points = np.array(sample_points)

# Modify the point validation to separate land and water points
plot_points = []
plot_weights = []
hull_points = []
hull_weights = []

# Pre-calculate distance limits for all datacenters
dc_limits = {
    dc_name: calculate_max_distance(min_latencies[dc_name])
    for dc_name in min_distances
}

for point in sample_points:
    weights = []  # Store weights for each datacenter
    valid = True
    
    # Check against all datacenters at once
    for dc_name, coords in DATACENTERS.items():
        if dc_name not in min_distances:
            continue
            
        dc_lon, dc_lat = coords
        # Calculate distance using geod.inv()
        _, _, dist = geod.inv(point[0], point[1], dc_lon, dc_lat)
        dist_km = abs(dist) / 1000  # Convert to positive kilometers
        
        max_dist_min, max_dist_max = dc_limits[dc_name]
        
        # Early exit if point is outside maximum distance
        if dist_km > max_dist_max:
            valid = False
            break
            
        # Calculate weight if point is valid
        if dist_km <= max_dist_min:
            weights.append(1.0)
        else:
            # Linear interpolation between min and max distances
            weight = 1.0 - (dist_km - max_dist_min) / (max_dist_max - max_dist_min)
            weights.append(max(min(weight, 1.0), 0.0))
    
    if valid and weights:
        point_weight = np.prod(weights)
        hull_points.append(point)
        hull_weights.append(point_weight)
        
        # Only add to plot points if on land
        point_geom = Point(point[0], point[1])
        if land.contains(point_geom):
            plot_points.append(point)
            plot_weights.append(point_weight)

# Convert to numpy arrays
plot_points = np.array(plot_points)
plot_weights = np.array(plot_weights)
hull_points = np.array(hull_points)
hull_weights = np.array(hull_weights)

# Normalize weights for plotting
if len(plot_weights) > 0:
    plot_weights = (plot_weights - plot_weights.min()) / (plot_weights.max() - plot_weights.min())

# Create and save the map
m = create_map(DATACENTERS, min_distances, plot_points, plot_weights)

# Use hull_points for convex hull calculation
if len(hull_points) > 0:
    try:
        hull = ConvexHull(hull_points)
        hull_vertices = hull_points[hull.vertices]
        
        # Close the polygon by adding the first point at the end
        hull_vertices = np.vstack([hull_vertices, hull_vertices[0]])
        
        # Create a Shapely polygon from hull points and clean it
        hull_polygon = Polygon(hull_vertices).buffer(0)  # buffer(0) fixes invalid geometries
        
        # Find intersecting countries with validation
        intersecting_countries = []
        for iso_code, geometry in world_boundaries.items():
            try:
                # Clean up the geometry and check intersection
                clean_geometry = geometry.buffer(0)
                if clean_geometry.is_valid and hull_polygon.is_valid:
                    if clean_geometry.intersects(hull_polygon):
                        intersecting_countries.append(iso_code)
            except Exception as e:
                print(f"Warning: Could not check intersection for {iso_code}: {e}")
                continue
        
        if intersecting_countries:
            print("\nPossible countries of origin (ISO codes):")
            print(intersecting_countries)
        else:
            print("\nNo valid country intersections found")
            
    except Exception as e:
        print(f"\nWarning: Could not create convex hull: {e}")
        print("Skipping country intersection check")

# Save the interactive map
m.save('triangulation_map.html')
print("\nMap saved as 'triangulation_map.html'")

