import pandas as pd
import numpy as np
import time
import json
import boto3
import requests
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from scipy.spatial import ConvexHull
import folium
from folium.plugins import HeatMap
from folium import plugins
from pyproj import Geod
import country_borders
import pycountry
import os
import platform
import configparser

# Create a Geod object for geodesic calculations
geod = Geod(ellps='WGS84')

# Initialize the country borders data
country_shapes = country_borders.load_country_shapes()

# Add after imports, before the rest of the code
if platform.system() == 'Darwin':  # Check if running on macOS
    print("[0] Running on macOS - attempting to load local AWS credentials")
    try:
        # Load credentials from ~/.aws/credentials
        aws_credentials = configparser.ConfigParser()
        aws_credentials.read(os.path.expanduser('~/.aws/credentials'))
        
        # Use default profile unless specified otherwise
        profile = 'rix-admin-chris'
        if aws_credentials.has_section(profile):
            os.environ['AWS_ACCESS_KEY_ID'] = aws_credentials[profile]['aws_access_key_id']
            os.environ['AWS_SECRET_ACCESS_KEY'] = aws_credentials[profile]['aws_secret_access_key']
            if 'aws_session_token' in aws_credentials[profile]:
                os.environ['AWS_SESSION_TOKEN'] = aws_credentials[profile]['aws_session_token']
            print("[0] Successfully loaded AWS credentials from local file")
        else:
            print("[0] Warning: Default profile not found in AWS credentials file")
    except Exception as e:
        print(f"[0] Warning: Could not load AWS credentials: {str(e)}")

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
    
    time_s = max(0, (time_ms - LAMBDA_STARTUP)) / 1000
    max_distance_min = (time_s * SPEED_OF_LIGHT * FIBER_FACTOR) / ROUTING_FACTOR_MAX
    max_distance_max = (time_s * SPEED_OF_LIGHT * FIBER_FACTOR) / ROUTING_FACTOR_MIN
    return max_distance_min, max_distance_max

DATACENTERS = {
    'eu-central-1': (8.6821, 50.1109),    # Frankfurt
    'eu-west-1': (-6.2603, 53.3498),      # Ireland
    'ap-northeast-1': (139.6503, 35.6762), # Tokyo
    'ap-south-1': (72.8777, 19.0760),     # Mumbai
    'sa-east-1': (-46.6333, -23.5505),    # São Paulo
    'us-east-1': (-77.4874, 39.0438),     # N. Virginia
    'us-west-2': (-116.4568, 33.7490),    # Oregon
    'af-south-1': (18.4241, -33.9249),    # Cape Town
}

def get_world_boundaries():
    url = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    response = requests.get(url)
    countries = response.json()
    
    world_geometries = {}
    for feature in countries['features']:
        iso_code = feature['properties']['ISO_A2']
        if iso_code != '-99':
            try:
                coords = feature['geometry']['coordinates']
                if feature['geometry']['type'] == 'Polygon':
                    # Handle date line crossing for single polygons
                    poly = Polygon(coords[0]).buffer(0)
                    if poly.is_valid:
                        world_geometries[iso_code] = poly
                elif feature['geometry']['type'] == 'MultiPolygon':
                    # Handle date line crossing for multipolygons
                    polys = []
                    for poly_coords in coords:
                        try:
                            poly = Polygon(poly_coords[0]).buffer(0)
                            if poly.is_valid:
                                polys.append(poly)
                        except (ValueError, TypeError):
                            continue
                    if polys:
                        world_geometries[iso_code] = MultiPolygon(polys)
            except (ValueError, TypeError) as e:
                print(f"Error processing country {iso_code}: {str(e)}")
                continue
    
    # Create a valid union of all geometries
    try:
        return world_geometries
    except Exception as e:
        print(f"Error creating world geometries: {str(e)}")
        return {}

def create_map(datacenters, min_distances, min_latencies, plot_points, plot_weights):
    center_lat = np.mean([lat for lon, lat in datacenters.values()])
    center_lon = np.mean([lon for lon, lat in datacenters.values()])
    m = folium.Map(location=[center_lat, center_lon], zoom_start=2)
    
    for dc_name, coords in datacenters.items():
        if dc_name not in min_distances:
            continue
            
        lon, lat = coords
        radius_km = min_distances[dc_name]
        
        folium.CircleMarker(
            location=[lat, lon],
            radius=8,
            color='black',
            fill=True,
            popup=f"{dc_name}<br>Min latency: {min_latencies[dc_name]:.1f}ms"
        ).add_to(m)
        
        current_segment = []
        segments = []
        prev_lon = None
        crosses_meridian = False
        
        for bearing in range(0, 360, 5):
            end_lon, end_lat, _ = geod.fwd(lon, lat, bearing, radius_km * 1000)
            
            if prev_lon is not None:
                if abs(end_lon - prev_lon) > 180:
                    crosses_meridian = True
                    segments.append(current_segment)
                    current_segment = []
            
            current_segment.append([end_lat, end_lon])
            prev_lon = end_lon
        
        if current_segment:
            segments.append(current_segment)
        
        for segment in segments:
            if not crosses_meridian and segment == segments[-1]:
                segment.append(segments[0][0])
                
            folium.PolyLine(
                locations=segment,
                color='black',
                weight=2,
                opacity=0.5
            ).add_to(m)
    
    if len(plot_points) > 0:
        heat_data = [[point[1], point[0], weight] 
                    for point, weight in zip(plot_points, plot_weights)]
        plugins.HeatMap(heat_data).add_to(m)
    
    return m

def get_intersecting_countries(polygon_coords):
    """
    Find countries that intersect with the given polygon
    """
    hull_polygon = Polygon(polygon_coords)
    
    # Ensure the polygon is valid
    if not hull_polygon.is_valid:
        hull_polygon = hull_polygon.buffer(0)  # Attempt to fix invalid polygon
    
    intersecting = []
    
    for country_code, country_shape in country_shapes.items():
        if hull_polygon.intersects(country_shape):
            try:
                country = pycountry.countries.get(alpha_3=country_code)
                if country:
                    intersecting.append(country.name)
            except:
                continue
    
    return intersecting

def lambda_handler(event, context):
    try:
        target_ip = event.get('requestContext', {}).get('http', {}).get('sourceIp', event.get('requestContext', {}).get('identity', {}).get('sourceIp'))
        print(f"[1] Starting processing for Target IP: {target_ip}")
        if not target_ip:
            return {
                'statusCode': 400,
                'body': 'IP address is required'
            }

        # Get world boundaries and create land polygon
        world_geometries = get_world_boundaries()
        try:
            # First buffer each geometry individually
            buffered_geometries = [geom.buffer(0) for geom in world_geometries.values()]
            # Then create the union
            land = unary_union(buffered_geometries)
            # Final buffer to ensure validity
            land = land.buffer(0)
        except Exception as e:
            print(f"Error creating land geometry: {str(e)}")
            land = MultiPolygon()  # Fallback to empty geometry

        # Get recent files from S3 instead of local directory
        s3_client = boto3.client('s3')
        print(f"[1.2] Getting recent files from S3")
        bucket_name = 'ipvotes'
        recent_data = []
        
        # Get current timestamp
        current_time = time.time() * 1000
        n_minutes_ago = current_time - (20 * 60 * 60 * 1000)  # 20 hours ago

        # List and filter S3 objects more efficiently
        # Use prefix to filter by both date and IP
        prefix = f'triangulation/{target_ip}/'
        
        print(f"[1.3] Searching S3 with prefix: {prefix}")
        paginator = s3_client.get_paginator('list_objects_v2')
        
        # Use pagination to handle large numbers of files
        file_count = 0
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            for obj in page.get('Contents', []):
                file_count += 1
                if file_count % 10 == 0:
                    print(f"[1.4] Processed {file_count} files...")
                    
                try:
                    response = s3_client.get_object(Bucket=bucket_name, Key=obj['Key'])
                    contents = json.loads(response['Body'].read().decode('utf-8'))
                    
                    # Quick filter before adding to recent_data
                    if (contents.get('lambdaStartTimestamp', 0) > n_minutes_ago and 
                        contents.get('ip') == target_ip):
                        recent_data.append(contents)
                except Exception as e:
                    print(f"[1.5] Error processing file {obj['Key']}: {str(e)}")
                    continue

        print(f"[1.6] Completed S3 search. Processed {file_count} files, found {len(recent_data)} relevant records")

        recent_df = pd.DataFrame(recent_data)

        # After S3 data retrieval
        print(f"[2] Retrieved {len(recent_data)} records from S3")
        
        # Before clock shift calculations
        print(f"[3] Starting clock shift calculations for {len(recent_df['nonce'].unique())} unique nonces")
        
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

        # After median shift calculation
        print(f"[4] Calculated median clock shift: {median_shift:.2f} ms")
        print(f"[5] Found {len(valid_nonces)} valid nonces out of {len(nonce_shifts)}")
        
        # Before minimum latency calculations
        print("[6] Starting minimum latency calculations")
        
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

        # After minimum latency calculations
        print("\n[7] Calculated minimum latencies:")
        for region, latency in min_latencies.items():
            if latency != float('inf'):
                print(f"  {region}: {latency:.2f} ms")
        
        # Calculate distances from minimum latencies
        min_distances = {
            region: calculate_max_distance(latency)[1]
            for region, latency in min_latencies.items()
            if latency != float('inf')
        }

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

        # Before point generation
        print(f"\n[8] Starting point generation with {n_points} points")

        # Generate sample points within the smallest circle
        sample_points = []
        valid_weights = []

        for i in range(n_points):
            angle = (360 * i / n_points)  # Calculate angle in degrees directly
            dc_lon, dc_lat = DATACENTERS[smallest_circle_dc]  # Get coordinates of smallest circle DC
            r = np.sqrt(np.random.random()) * smallest_radius * 1000  # Convert to meters
            lon, lat, _ = geod.fwd(dc_lon, dc_lat, angle, r)
            if abs(lon - dc_lon) > 180:
                lon = lon - 360 if lon > 0 else lon + 360
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
                dist = geod.inv(point[0], point[1], dc_lon, dc_lat)[2]
                dist_km = dist / 1000
                
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
                try:
                    # Handle date line crossing
                    if point[0] < -180:
                        point_geom = Point(point[0] + 360, point[1])
                    elif point[0] > 180:
                        point_geom = Point(point[0] - 360, point[1])
                    
                    if land.is_valid and land.contains(point_geom):
                        plot_points.append(point)
                        plot_weights.append(point_weight)
                except Exception as e:
                    print(f"Error checking point containment: {str(e)}")
                    continue

        # Convert to numpy arrays
        plot_points = np.array(plot_points)
        plot_weights = np.array(plot_weights)
        hull_points = np.array(hull_points)
        hull_weights = np.array(hull_weights)

        # Normalize weights for plotting
        if len(plot_weights) > 0:
            plot_weights = (plot_weights - plot_weights.min()) / (plot_weights.max() - plot_weights.min())

        # Use hull_points for convex hull calculation
        intersecting_countries = []
        if len(hull_points) > 0:
            try:
                hull = ConvexHull(hull_points)
                hull_vertices = hull_points[hull.vertices]
                hull_vertices = np.vstack([hull_vertices, hull_vertices[0]])
                
                # Create a valid polygon from hull vertices
                hull_poly = Polygon(hull_vertices).buffer(0)
                if hull_poly.is_valid:
                    # Get intersecting countries
                    intersecting_countries = get_intersecting_countries(hull_vertices)
            except Exception as e:
                print(f"Error creating convex hull: {str(e)}")
                intersecting_countries = []

        # Create the map using folium
        m = create_map(DATACENTERS, min_distances, min_latencies, plot_points, plot_weights)
        
        # Get HTML string from the map
        html_data = m._repr_html_()

        # Add debug prints for recent data
        print(f"\nFound {len(recent_data)} recent measurements")
        print(f"Time window: {n_minutes_ago} to {current_time}")
        
        # Add debug prints for clock shifts
        print(f"\nClock shifts by nonce:")
        for nonce, shift in nonce_shifts.items():
            print(f"Nonce {nonce}: {shift:.2f} ms")
        
        # Add debug prints for sample points
        print(f"\nGenerated {n_points} sample points")
        print(f"Valid points for plotting: {len(plot_points)}")
        print(f"Points used for hull calculation: {len(hull_points)}")
        
        # Add debug print for intersecting countries
        print(f"\nPossible countries: {intersecting_countries}")

        # After point validation
        print(f"[9] Point validation complete:")
        print(f"  Total sample points: {len(sample_points)}")
        print(f"  Valid hull points: {len(hull_points)}")
        print(f"  Valid plot points: {len(plot_points)}")
        
        # Before map creation
        print("[10] Starting map creation")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
                'X-Possible-Countries': ','.join(intersecting_countries),
                'Access-Control-Expose-Headers': 'X-Possible-Countries'
            },
            'body': html_data
        }

    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return {
            'statusCode': 500,
            'body': f'Error processing request: {str(e)}'
        }

